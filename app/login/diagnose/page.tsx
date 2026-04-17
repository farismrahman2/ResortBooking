import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * Sign-in diagnostics page.
 * Shows whether env vars are configured and whether the server can reach Supabase.
 * Does NOT require authentication — the middleware treats /login/* as public.
 */
export default async function DiagnosePage() {
  const url      = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey  = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const svcKey   = process.env.SUPABASE_SERVICE_ROLE_KEY

  const urlOk  = !!url  && url.startsWith('https://') && url.endsWith('.supabase.co')
  const anonOk = !!anonKey  && anonKey.length > 40
  const svcOk  = !!svcKey   && svcKey.length > 40

  // Try a simple call to verify reachability. "Auth session missing!" and
  // "session_not_found" are both EXPECTED when no one is logged in — they
  // confirm Supabase accepted the API key and responded.
  let reachability: { ok: boolean; detail: string } = { ok: false, detail: 'Not tested' }
  if (urlOk && anonOk) {
    try {
      const supabase = createClient()
      const { data, error } = await supabase.auth.getUser()
      const noSessionMessages = ['session_not_found', 'Auth session missing', 'JWT expired']
      const isNoSession = error && noSessionMessages.some((m) => error.message.includes(m))

      if (isNoSession) {
        reachability = { ok: true, detail: 'Reached Supabase - API key accepted (no active session, which is expected)' }
      } else if (error) {
        reachability = { ok: false, detail: `Supabase error: ${error.message}` }
      } else {
        reachability = { ok: true, detail: data.user ? `Logged in as ${data.user.email}` : 'Reached Supabase (no session)' }
      }
    } catch (err) {
      reachability = { ok: false, detail: `Network error: ${err instanceof Error ? err.message : String(err)}` }
    }
  } else {
    reachability = { ok: false, detail: 'Skipped - env vars missing or malformed' }
  }

  // Key format detection
  const isNewKeyFormat = anonKey?.startsWith('sb_publishable_') || anonKey?.startsWith('sb_pub_')
  const isLegacyJwt    = anonKey?.startsWith('eyJ')
  let keyFormatNote: string | null = null
  if (isNewKeyFormat) {
    keyFormatNote = 'Using new publishable key format (sb_publishable_...). Requires @supabase/ssr >= 0.5.0 and @supabase/supabase-js >= 2.45.0.'
  } else if (isLegacyJwt) {
    keyFormatNote = 'Using legacy JWT key format (eyJ...). Works with all SDK versions.'
  }

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-8">
      <div className="max-w-xl mx-auto">
        <h1 className="text-lg font-bold text-gray-900 mb-1">Sign-in Diagnostics</h1>
        <p className="text-sm text-gray-500 mb-6">Server-side check of the Supabase setup.</p>

        <div className="space-y-3">
          <Row label="NEXT_PUBLIC_SUPABASE_URL" ok={urlOk}
               value={url ? maskUrl(url) : '(not set)'}
               hint={!url ? 'Missing — add in Vercel → Settings → Environment Variables' :
                     !urlOk ? 'Wrong format — should look like https://xxxx.supabase.co' : undefined} />

          <Row label="NEXT_PUBLIC_SUPABASE_ANON_KEY" ok={anonOk}
               value={anonKey ? maskKey(anonKey) : '(not set)'}
               hint={!anonKey ? 'Missing — add in Vercel → Settings → Environment Variables' :
                     !anonOk ? 'Too short — check the value is correct' : undefined} />

          <Row label="SUPABASE_SERVICE_ROLE_KEY" ok={svcOk}
               value={svcKey ? maskKey(svcKey) : '(not set)'}
               hint={!svcKey ? 'Missing — needed for some server actions' : undefined} />

          <Row label="Supabase reachability" ok={reachability.ok} value={reachability.detail} />

          {keyFormatNote && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-xs text-blue-800">
              <p className="font-semibold mb-1">Key format</p>
              <p>{keyFormatNote}</p>
            </div>
          )}
        </div>

        <div className="mt-6 rounded-lg border border-gray-200 bg-white px-4 py-3 text-xs text-gray-600">
          <p className="font-semibold text-gray-800 mb-1">If sign-in still fails:</p>
          <ol className="list-decimal list-inside space-y-1">
            <li>Supabase Dashboard → Authentication → Providers → <strong>Email</strong> → ensure <strong>&quot;Confirm email&quot;</strong> is OFF, then re-create the user.</li>
            <li>Supabase Dashboard → Authentication → Users → delete the test user and click <strong>Add user → Create new user</strong> (not &quot;Send invitation&quot;).</li>
            <li>Use the exact email and password you set. Password is case-sensitive.</li>
            <li>If &quot;Invalid login credentials&quot; — user/password wrong. If hang — likely CORS or wrong URL.</li>
          </ol>
        </div>

        <p className="mt-4 text-center text-xs text-gray-400">
          <a href="/login" className="text-forest-700 hover:underline">← Back to sign in</a>
        </p>
      </div>
    </div>
  )
}

function maskUrl(url: string) {
  return url.replace(/https:\/\/([^.]+)/, (_, ref) => `https://${ref.slice(0, 4)}${'*'.repeat(Math.max(0, ref.length - 4))}`)
}
function maskKey(key: string) {
  return `${key.slice(0, 6)}...${key.slice(-4)} (${key.length} chars)`
}

function Row({ label, ok, value, hint }: { label: string; ok: boolean; value: string; hint?: string }) {
  return (
    <div className={`rounded-lg border px-4 py-3 ${ok ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className={`text-xs font-semibold ${ok ? 'text-green-800' : 'text-red-800'}`}>
            {ok ? '✓' : '✗'} {label}
          </p>
          <p className="text-xs font-mono text-gray-700 mt-0.5 break-all">{value}</p>
          {hint && <p className="text-xs text-red-700 mt-1">{hint}</p>}
        </div>
      </div>
    </div>
  )
}
