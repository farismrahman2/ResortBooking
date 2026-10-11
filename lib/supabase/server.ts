import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { boundedFetch } from '@/lib/supabase/deadline'

/** No single Supabase call from a page or action may hang: a stuck call used
 *  to hold the page until Vercel killed it. Generous enough for reports. */
const SERVER_FETCH_TIMEOUT_MS = 15000

/** Standard server client — used in Server Components and API Routes */
export function createClient() {
  const cookieStore = cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { fetch: boundedFetch(SERVER_FETCH_TIMEOUT_MS) },
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            )
          } catch {
            // Called from a Server Component — cookie writes are fine to ignore
          }
        },
      },
    },
  )
}

/** Service-role client — bypasses RLS, only for Server Actions that need elevated writes */
export function createServiceClient() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { createClient: rawCreate } = require('@supabase/supabase-js') as typeof import('@supabase/supabase-js')
  return rawCreate(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}
