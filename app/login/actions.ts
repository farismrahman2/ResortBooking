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

    // Log everything to server logs (visible in Vercel Functions tab)
    console.log('[signIn] attempt for:', email, 'result:', {
      hasSession: !!data?.session,
      hasUser:    !!data?.user,
      errorCode:  error?.code,
      errorStatus: error?.status,
      errorMsg:   error?.message,
    })

    if (error) {
      // Specific guidance for common errors
      const msg = error.message.toLowerCase()
      if (msg.includes('email not confirmed')) {
        return {
          error:
            'Email not confirmed. In Supabase Dashboard: Authentication → Providers → ' +
            'Email → expand the panel → turn OFF "Confirm email". Then delete this user ' +
            'and re-create them via "Add user → Create new user".',
        }
      }
      if (msg.includes('invalid login credentials') || msg.includes('invalid_credentials')) {
        return { error: 'Invalid email or password. Double-check what you set in Supabase Dashboard → Authentication → Users.' }
      }
      if (msg.includes('api key') || msg.includes('invalid key') || msg.includes('unauthorized')) {
        return {
          error:
            `Supabase rejected the API key (${error.message}). This usually means your ` +
            `NEXT_PUBLIC_SUPABASE_ANON_KEY is wrong OR the installed @supabase/ssr version ` +
            `is too old for the new sb_publishable_ key format. The package.json was just ` +
            `bumped — redeploy should fix it.`,
        }
      }
      return { error: `${error.message} (status ${error.status ?? 'n/a'})` }
    }

    if (!data.session) {
      return {
        error:
          'Sign-in returned no session. Most likely "Confirm email" is ON in Supabase. ' +
          'Turn it OFF in Authentication → Providers → Email, then re-create the user.',
      }
    }
  } catch (err) {
    // Network, URL, or other unexpected failure — log for Vercel console
    console.error('[signIn] unexpected error:', err)
    const message = err instanceof Error ? err.message : String(err)
    return {
      error: `Unexpected error: ${message}. Check Vercel Deployments → latest → Functions → /login/actions logs.`,
    }
  }

  // Session cookie has been set by the Supabase client's cookie handler.
  // redirect() throws internally — it MUST be outside the try/catch above.
  redirect(next)
}
