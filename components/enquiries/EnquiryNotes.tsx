'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/Textarea'
import { appendEnquiryNote } from '@/lib/actions/enquiries'

interface Props {
  id: string
  notes: string | null
  canWrite: boolean
}

export function EnquiryNotes({ id, notes, canWrite }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)

  function submit() {
    const note = value.trim()
    if (!note || pending) return
    setError(null)
    startTransition(async () => {
      const res = await appendEnquiryNote({ id, note })
      if (!res.success) { setError(res.error ?? 'Failed to add note'); return }
      setValue('')
      router.refresh()
    })
  }

  return (
    <div className="space-y-3">
      {notes ? (
        <pre className="whitespace-pre-wrap rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
{notes}
        </pre>
      ) : (
        <p className="text-sm text-gray-400">No internal notes yet.</p>
      )}

      {canWrite && (
        <div>
          <Textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            rows={3}
            placeholder="Add an internal note (e.g. called, left voicemail, quoted BDT 45k)…"
          />
          {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
          <div className="mt-2 flex justify-end">
            <Button variant="primary" size="sm" onClick={submit} loading={pending} disabled={!value.trim()}>
              Add note
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
