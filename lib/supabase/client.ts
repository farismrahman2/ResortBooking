import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      // No background refresh timer in the browser: the middleware refreshes
      // the session cookie on every navigation, and two refreshers rotating
      // the same refresh token at once made Supabase Auth stall (12s
      // "context deadline exceeded") and the site time out. An expired
      // session is still refreshed on demand when an upload needs it.
      auth: { autoRefreshToken: false },
    },
  )
}
