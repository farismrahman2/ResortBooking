import { NextResponse, type NextRequest } from 'next/server'
import { createMiddlewareClient } from '@/lib/supabase/middleware'

/**
 * Map URL prefix → module slug. Used for the route-level read-permission check
 * after auth. Order matters — most specific first (none currently overlap, so
 * the order is mostly cosmetic).
 */
const MODULE_PREFIX: Array<{ prefix: string; module: 'bookings' | 'checkout' | 'expenses' | 'hr' | 'reports' | 'settings' }> = [
  { prefix: '/bookings',  module: 'bookings' },
  { prefix: '/checkout',  module: 'checkout' },
  { prefix: '/expenses',  module: 'expenses' },
  { prefix: '/hr',        module: 'hr'       },
  { prefix: '/analytics', module: 'reports'  },   // existing booking analytics page
  { prefix: '/reports',   module: 'reports'  },
  { prefix: '/settings',  module: 'settings' },
]

function moduleForPath(pathname: string): typeof MODULE_PREFIX[number]['module'] | null {
  for (const m of MODULE_PREFIX) {
    if (pathname === m.prefix || pathname.startsWith(m.prefix + '/')) return m.module
  }
  return null
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
    // IMPORTANT: this refreshes the session cookie if needed
    const { data } = await supabase.auth.getUser()
    user = data.user
  } catch {
    // If Supabase is unreachable, allow login routes through so user can still see diagnose
    if (isLoginRoute || isAuthRoute) return NextResponse.next()
    if (isApiRoute) return NextResponse.json({ error: 'Auth service unavailable' }, { status: 503 })
    return NextResponse.redirect(new URL('/login/diagnose', request.url))
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

  // Module-level read-permission check
  if (user) {
    const mod = moduleForPath(pathname)
    if (mod) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const db = supabase as any
        const { data: profile } = await db
          .from('user_profiles')
          .select('role_id, is_active')
          .eq('user_id', user.id)
          .maybeSingle()

        // No profile yet (migration not run, or onboarding incomplete) — allow,
        // since the only people with auth.users at this stage should be the admin
        // who will be backfilled by the migration. Defensive fail-open.
        if (!profile) return response

        if (!profile.is_active) {
          await supabase.auth.signOut()
          return NextResponse.redirect(new URL('/login?deactivated=1', request.url))
        }

        const { data: perm } = await db
          .from('role_permissions')
          .select('level, module:modules!inner (slug)')
          .eq('role_id', profile.role_id)

        const permMap = new Map<string, string>()
        for (const r of (perm ?? []) as Array<{ level: string; module: { slug: string } }>) {
          permMap.set(r.module.slug, r.level)
        }
        const lvl = permMap.get(mod) ?? 'none'
        if (lvl === 'none') {
          if (isApiRoute) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
          }
          const url = new URL('/403', request.url)
          url.searchParams.set('from', mod)
          return NextResponse.redirect(url)
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
