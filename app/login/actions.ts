'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

/**
 * Server-side sign-in action. Runs on the server so:
 * - Env vars are always available (no build-time bundling issue)
 * - Cookies are set via the server cookie store (no browser race)
 * - Network path is Server → Supabase, avoiding browser CORS issues
 */
export async function signInAction(formData: FormData): Promise<{ error: string } | void> {
  const email    = String(formData.get('email') ?? '').trim()
  const password = String(formData.get('password') ?? '')
  const nextRaw  = String(formData.get('next') ?? '/')

  // Sanitise next param — prevent open-redirect abuse
  const next = nextRaw.startsWith('/') && !nextRaw.startsWith('//') ? nextRaw : '/'

  if (!email || !password) {
    return { error: 'Email and password are required.' }
  }

  // Verify env vars are configured — the #1 cause of silent failures on Vercel
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return {
      error:
        'Server configuration error: Supabase credentials are missing. ' +
        'Check that NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY ' +
        'are set in the deployment environment.',
    }
  }

  try {
    const supabase = createClient()
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      // Typical errors: "Invalid login credentials", "Email not confirmed"
      return { error: error.message }
    }

    if (!data.session) {
      return {
        error:
          'Sign-in did not produce a session. If you just created this user, ' +
          'make sure "Confirm email" is OFF in Supabase Dashboard → Authentication → ' +
          'Providers → Email, then create the user again.',
      }
    }
  } catch (err) {
    // Network, URL, or other unexpected failure
    const message = err instanceof Error ? err.message : String(err)
    return {
      error: `Unexpected error: ${message}. Check Vercel deployment logs for details.`,
    }
  }

  // Session cookie has been set by the Supabase client's cookie handler.
  // redirect() throws internally — it MUST be outside the try/catch above.
  redirect(next)
}
