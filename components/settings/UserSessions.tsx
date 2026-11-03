'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { LogOut, Monitor, ShieldAlert } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { signOutUser, type UserSession } from '@/lib/actions/users'
import { safeCall } from '@/lib/actions/safe-call'
import { toast } from '@/lib/toast/store'

const when = (iso: string) => new Date(iso).toLocaleString('en-GB', {
  timeZone: 'Asia/Dhaka', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
})

/** Settings → Users → (user): every device they're signed in on, with sign-out. */
export function UserSessions({ userId, sessions, isSelf, error }: {
  userId: string; sessions: UserSession[]; isSelf: boolean; error?: string | null
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [busy, setBusy] = useState<string | null>(null)
  const others = sessions.filter((s) => !s.current)

  function signOut(sessionId?: string) {
    setBusy(sessionId ?? 'all')
    start(async () => {
      const r = await safeCall(() => signOutUser(userId, sessionId))
      setBusy(null)
      if (!r.success) { toast.error(r.error); return }
      toast.success(sessionId ? 'Signed out of that device' : `Signed out of ${r.data.ended} device${r.data.ended === 1 ? '' : 's'}`)
      router.refresh()
    })
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 sm:p-5 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-700">Signed-in devices</h3>
        <span className="text-xs text-gray-400">{sessions.length}</span>
        {others.length > 0 && (
          <Button variant="danger" size="sm" className="ml-auto gap-1.5" loading={pending && busy === 'all'} onClick={() => signOut()}>
            <LogOut size={13} /> {isSelf ? 'Sign out my other devices' : 'Sign out of all devices'}
          </Button>
        )}
      </div>
      <p className="flex items-start gap-1.5 text-xs text-gray-500">
        <ShieldAlert size={13} className="mt-0.5 shrink-0 text-amber-600" />
        Lost or stolen laptop or phone? Sign it out here, then reset the password. The device is sent to the login page on its next click.
      </p>
      {error && <p className="text-xs text-red-600">{error}</p>}
      {sessions.length === 0 ? (
        <p className="text-sm text-gray-500">Not signed in anywhere.</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {sessions.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
              <Monitor size={15} className="text-gray-400" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-900">
                  {s.device}
                  {s.current && <span className="ml-2 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">this device</span>}
                </p>
                <p className="text-xs text-gray-500">
                  Last active {when(s.last_active)} · signed in {when(s.created_at)}{s.ip ? ` · IP ${s.ip}` : ''}
                </p>
              </div>
              {!s.current && (
                <Button variant="outline" size="sm" loading={pending && busy === s.id} onClick={() => signOut(s.id)}>
                  Sign out
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
