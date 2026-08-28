import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * How long any single Supabase call from middleware may take before it is
 * abandoned.
 *
 * Middleware sits in front of every request, so a call that hangs doesn't
 * degrade one page — it holds the whole request open until Vercel kills the
 * invocation and returns 504 MIDDLEWARE_INVOCATION_TIMEOUT. That is not a
 * theoretical risk: it happened in production.
 *
 * A plain try/catch does NOT protect against this. It catches errors, and a
 * socket that is accepted but never answered produces no error — it produces
 * silence. Only an abort turns that silence into something catchable.
 *
 * 2.5s is generous for a healthy round trip (the database is a region away,
 * so ~200ms is normal) while still leaving the request far short of the
 * platform's limit.
 */
export const SUPABASE_TIMEOUT_MS = 2500

/** fetch that gives up rather than hanging forever. */
function boundedFetch(timeoutMs: number): typeof fetch {
  return (input, init) => {
    const timeout = AbortSignal.timeout(timeoutMs)
    // Respect a caller's own signal where the runtime can combine them.
    const signal = init?.signal
      ? (typeof AbortSignal.any === 'function'
          ? AbortSignal.any([init.signal, timeout])
          : init.signal)
      : timeout
    return fetch(input, { ...init, signal })
  }
}

/**
 * Create a Supabase client bound to the current request/response.
 * Used by middleware.ts to refresh the session cookie on every request.
 *
 * Every call this client makes is time-bounded — see SUPABASE_TIMEOUT_MS.
 *
 * @returns { supabase, response } — the response may have refreshed auth cookies attached
 */
export function createMiddlewareClient(request: NextRequest) {
  let response = NextResponse.next({
    request: { headers: request.headers },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { fetch: boundedFetch(SUPABASE_TIMEOUT_MS) },
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({
            request: { headers: request.headers },
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  return { supabase, response }
}
