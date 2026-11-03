'use client'

import { useState, useTransition } from 'react'
import { ShieldAlert } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { signOutEveryone } from '@/lib/actions/users'
import { safeCall } from '@/lib/actions/safe-call'
import { toast } from '@/lib/toast/store'

/** Settings → Users: sign every user out of every device except this one. */
export function EmergencySignOut() {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function run() {
    setError(null)
    start(async () => {
      const r = await safeCall(() => signOutEveryone(text))
      if (!r.success) { setError(r.error); return }
      toast.success(`Everyone signed out — ${r.data.ended} session${r.data.ended === 1 ? '' : 's'} ended`)
      setOpen(false); setText('')
    })
  }

  return (
    <>
      <Button variant="danger" size="md" className="gap-1.5" onClick={() => setOpen(true)}>
        <ShieldAlert size={14} /> Emergency: sign out everyone
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Sign out everyone">
        <div className="space-y-3">
          <p className="text-sm text-gray-700">
            Every staff member is signed out of every phone and computer right away. Only this device stays signed in.
            Use it when a device is lost or stolen and you don&apos;t know whose it was. Then reset that person&apos;s password.
          </p>
          <Input label="Type SIGN OUT to confirm" value={text} onChange={(e) => setText(e.target.value)} placeholder="SIGN OUT" />
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" size="md" onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="danger" size="md" loading={pending} disabled={text.trim().toUpperCase() !== 'SIGN OUT'} onClick={run}>
              Sign out everyone
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
