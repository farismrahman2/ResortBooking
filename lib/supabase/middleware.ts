import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { boundedFetch } from '@/lib/supabase/deadline'

/**
 * How long any single Supabase call from middleware may take. Long enough
 * for a slow session refresh to FINISH — cutting a refresh off half-way
 * leaves the browser holding a refresh token Supabase has already rotated,
 * and every later request then fails too. The total, retries included, is
 * capped separately in middleware.ts (MIDDLEWARE_AUTH_DEADLINE_MS).
 */
export const SUPABASE_TIMEOUT_MS = 8000

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
