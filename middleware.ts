import { NextResponse, type NextRequest } from 'next/server'
import { createMiddlewareClient } from '@/lib/supabase/middleware'

/**
 * Map URL prefix → module slug. Used for the route-level read-permission check
 * after auth. Order matters — most specific first. `/hr/attendance` MUST come
 * before `/hr` so front_desk users (who have `attendance` but not `hr`) don't
 * get 403'd on the attendance page.
 */
type RoleSlug = 'admin' | 'manager' | 'front_desk' | 'accountant' | 'reservation' | 'corporate_sales' | 'operations_manager' | 'md' | 'review_collector'

/**
 * Per-role route deny-list. Used when a role passes the module-level check
 * but should still be blocked from a specific sub-route. Example: the
 * 'reservation' role has bookings:write (so it can use /quotes and
 * /bookings) but should not see /packages, which is also under the bookings
 * module.
 */
const ROLE_DENY: Array<{ prefix: string; roles: RoleSlug[] }> = [
  { prefix: '/packages', roles: ['reservation'] },
]

/**
 * Per-role route allow-list. Lets specific roles through a given prefix even
 * when their module-level permission would otherwise be 'none'. Example:
 * front_desk does not have reports access generally, but should see the
 * daily income-by-method report so they can reconcile shift takings.
 */
const ROLE_ALLOW: Array<{ prefix: string; roles: RoleSlug[] }> = [
  { prefix: '/reports/income/by-payment-method', roles: ['front_desk'] },
]

const MODULE_PREFIX: Array<{ prefix: string; module: 'bookings' | 'checkout' | 'expenses' | 'hr' | 'reports' | 'settings' | 'availability' | 'attendance' | 'coffee_shop' | 'inventory' | 'crm' | 'fixed_assets' | 'qa' | 'menus' | 'enquiries' | 'field_visits' | 'kitchen' }> = [
  { prefix: '/bookings',      module: 'bookings'     },
  { prefix: '/enquiries',     module: 'enquiries'    },
  { prefix: '/qa',            module: 'qa'           },
  { prefix: '/menus',         module: 'menus'        },
  { prefix: '/quotes',        module: 'bookings'     },   // quotes live under the bookings module
  { prefix: '/packages',      module: 'bookings'     },   // packages too — operational/booking-side
  { prefix: '/availability',  module: 'availability' },
  { prefix: '/checkout',      module: 'checkout'     },
  { prefix: '/coffee-shop',   module: 'coffee_shop'  },
  { prefix: '/inventory',     module: 'inventory'    },
  { prefix: '/kitchen',       module: 'kitchen'      },
  { prefix: '/crm/field-visits', module: 'field_visits' }, // MUST precede /crm — sub-permission
  { prefix: '/crm',           module: 'crm'          },
  { prefix: '/fixed-assets',  module: 'fixed_assets' },
  { prefix: '/expenses',      module: 'expenses'     },
  { prefix: '/hr/attendance', module: 'attendance'   },   // MUST precede /hr — sub-permission
  { prefix: '/hr',            module: 'hr'           },
  { prefix: '/analytics',     module: 'reports'      },
  { prefix: '/reports',       module: 'reports'      },
  { prefix: '/settings',      module: 'settings'     },
]

function moduleForPath(pathname: string): typeof MODULE_PREFIX[number]['module'] | null {
  for (const m of MODULE_PREFIX) {
    if (pathname === m.prefix || pathname.startsWith(m.prefix + '/')) return m.module
  }
  return null
}

/**
 * Supabase reachable but not answering in time, versus genuinely signed out.
 *
 * These must not be confused. `getUser()` returns a network failure the same
 * shape as "no session" — an error object, not a throw — so treating any
 * falsy user as logged-out means one slow round trip signs the whole resort
 * out. Retryable fetch errors carry status 0; aborts surface by name.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isTransientAuthFailure(error: any): boolean {
  if (!error) return false
  if (error.status === 0 || error.status === 504 || error.status === 503) return true
  const text = `${error.name ?? ''} ${error.message ?? ''}`
  return /abort|timeout|timed out|fetch failed|network|retryable/i.test(text)
}

interface CachedProfile {
  is_active: boolean
  roleSlug:  RoleSlug | undefined
  perms:     Record<string, string>
}

/**
 * Per-user permission cache.
 *
 * The profile + role + permissions lookup used to run on EVERY request — a
 * second cross-region round trip in front of every page load, for data that
 * changes maybe once a month. Edge instances are reused between requests, so
 * a module-level map removes almost all of them.
 *
 * Safe to serve slightly stale: this check is defence-in-depth. Every page
 * calls requirePermission() itself, uncached, and that is what actually
 * enforces access — so a role edit or a deactivation takes effect on the page
 * immediately, and only middleware's redirect lags by at most the TTL.
 */
const PROFILE_TTL_MS = 30_000
const PROFILE_CACHE_MAX = 500
const profileCache = new Map<string, { expires: number; value: CachedProfile | null }>()

function cacheGet(userId: string): { value: CachedProfile | null } | undefined {
  const hit = profileCache.get(userId)
  if (!hit) return undefined
  if (hit.expires < Date.now()) { profileCache.delete(userId); return undefined }
  return hit
}

function cacheSet(userId: string, value: CachedProfile | null) {
  // A long-lived isolate must not grow without bound; drop expired entries
  // first and fall back to clearing rather than tracking an LRU.
  if (profileCache.size >= PROFILE_CACHE_MAX) {
    const now = Date.now()
    for (const [k, v] of profileCache) if (v.expires < now) profileCache.delete(k)
    if (profileCache.size >= PROFILE_CACHE_MAX) profileCache.clear()
  }
  profileCache.set(userId, { expires: Date.now() + PROFILE_TTL_MS, value })
}

/**
 * Auth middleware — runs on every request (except static assets and Next internals).
 * - Refreshes the Supabase session cookie
 * - Redirects unauthenticated users to /login
 * - Redirects authenticated users away from /login
 * - Returns 401 JSON for unauthenticated /api/* requests
 * - Enforces module-level read permission for /bookings, /checkout, /expenses,
 *   /hr, /analytics, /reports, /settings — redirects to /403 if denied
 */
export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl
  const isLoginRoute = pathname === '/login' || pathname.startsWith('/login/')
  const isAuthRoute  = pathname.startsWith('/auth/')
  const isApiRoute   = pathname.startsWith('/api/')

  // Public server-to-server ingest endpoints authenticate themselves via a
  // Bearer secret in their own handler — there is NO logged-in Supabase user
  // on a machine-to-machine call, so they must bypass the session auth gate
  // below (which 401s every unauthenticated /api/* request). The route
  // handler still enforces its own secret, so this is not an open door.
  if (pathname === '/api/enquiries') {
    return NextResponse.next()
  }

  // Fail open for the login + diagnose routes if env vars are missing so the
  // user can still see diagnostic info instead of an opaque 500.
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    if (isLoginRoute || isAuthRoute) return NextResponse.next()
    // For everything else, redirect to the diagnose page
    return NextResponse.redirect(new URL('/login/diagnose', request.url))
  }

  const { supabase, response } = createMiddlewareClient(request)

  let user = null
  try {
    // IMPORTANT: this refreshes the session cookie if needed. Bounded by
    // SUPABASE_TIMEOUT_MS — an unbounded await here is what produced 504
    // MIDDLEWARE_INVOCATION_TIMEOUT in production.
    const { data, error } = await supabase.auth.getUser()
    if (isTransientAuthFailure(error)) throw error
    user = data.user
  } catch (err) {
    // Auth couldn't be reached — which is NOT the same as "signed out".
    if (isLoginRoute || isAuthRoute) return NextResponse.next()
    if (isApiRoute) return NextResponse.json({ error: 'Auth service unavailable' }, { status: 503 })
    // Let the request through rather than bouncing a signed-in user to
    // /login over one slow round trip. The page's own requirePermission()
    // runs uncached on the server and refuses if the user really is not
    // entitled to it, so nothing is exposed by being optimistic here.
    console.warn('[middleware] auth check failed, passing through:',
      err instanceof Error ? err.message : String(err))
    return response
  }

  // Not authenticated
  if (!user && !isLoginRoute && !isAuthRoute) {
    if (isApiRoute) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const loginUrl = new URL('/login', request.url)
    if (pathname !== '/') {
      loginUrl.searchParams.set('next', pathname + search)
    }
    return NextResponse.redirect(loginUrl)
  }

  // Authenticated user visiting /login (but not /login/diagnose) → send them to the dashboard
  if (user && pathname === '/login') {
    return NextResponse.redirect(new URL('/', request.url))
  }

  // Copy session cookies (refreshes, sign-out clears) onto a redirect —
  // returning a bare NextResponse.redirect DROPS everything the Supabase
  // client set on `response`, which is how a deactivated user's sign-out
  // never actually reached their browser.
  const redirectWithCookies = (url: URL) => {
    const redirect = NextResponse.redirect(url)
    for (const c of response.cookies.getAll()) redirect.cookies.set(c)
    return redirect
  }

  // Profile check — deactivation runs on EVERY authenticated path (it used to
  // run only on module-mapped ones, so a deactivated user could still open
  // the dashboard); the permission check stays scoped to mapped modules.
  // Single round-trip: nested select pulls profile + role_permissions + module slugs at once.
  if (user && !isLoginRoute && !isAuthRoute) {
    const mod = moduleForPath(pathname)
    {
      try {
        // Served from the per-user cache when warm — see PROFILE_TTL_MS.
        let cached = cacheGet(user.id)
        if (!cached) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const db = supabase as any
          const { data: profile, error: profileErr } = await db
            .from('user_profiles')
            .select(`
              role_id,
              is_active,
              role:roles!inner (
                slug,
                role_permissions (
                  level,
                  module:modules!inner (slug)
                )
              )
            `)
            .eq('user_id', user.id)
            .maybeSingle()

          // Couldn't reach the database — fail open WITHOUT caching, so the
          // next request retries instead of inheriting a blank verdict.
          if (profileErr) return response

          if (!profile) {
            // No profile yet (migration not run, or onboarding incomplete).
            cacheSet(user.id, null)
            return response
          }

          const rows = (profile.role?.role_permissions ?? []) as Array<{
            level: string
            module: { slug: string }
          }>
          const perms: Record<string, string> = {}
          for (const r of rows) perms[r.module.slug] = r.level

          cacheSet(user.id, {
            is_active: Boolean(profile.is_active),
            roleSlug:  profile.role?.slug as RoleSlug | undefined,
            perms,
          })
          cached = cacheGet(user.id)
        }

        const entry = cached?.value
        if (!entry) return response   // no profile — fail open

        if (!entry.is_active) {
          // Don't let a stale cache keep signing out a re-activated user.
          profileCache.delete(user.id)
          await supabase.auth.signOut().catch(() => {})
          if (isApiRoute) return NextResponse.json({ error: 'Account deactivated' }, { status: 403 })
          return redirectWithCookies(new URL('/login?deactivated=1', request.url))
        }

        if (!mod) return response   // no module mapping → nothing further to enforce

        const lvl = entry.perms[mod] ?? 'none'
        const roleSlug = entry.roleSlug

        // Per-role allow-list — lets specific roles through despite a 'none'
        // module permission (e.g. front_desk on the daily income report).
        const roleAllowed = roleSlug && ROLE_ALLOW.some((a) =>
          (pathname === a.prefix || pathname.startsWith(a.prefix + '/')) && a.roles.includes(roleSlug),
        )

        if (lvl === 'none' && !roleAllowed) {
          if (isApiRoute) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
          }
          const url = new URL('/403', request.url)
          url.searchParams.set('from', mod)
          return redirectWithCookies(url)
        }

        // Per-role deny-list — overrides a module-level allow
        if (roleSlug) {
          for (const deny of ROLE_DENY) {
            const matches = pathname === deny.prefix || pathname.startsWith(deny.prefix + '/')
            if (matches && deny.roles.includes(roleSlug)) {
              if (isApiRoute) {
                return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
              }
              const url = new URL('/403', request.url)
              url.searchParams.set('from', mod)
              return redirectWithCookies(url)
            }
          }
        }
      } catch {
        // DB unreachable — fail open rather than locking everyone out
      }
    }
  }

  return response
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico and common image extensions
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
}
