'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/Textarea'
import { AlertCircle, AlertTriangle, UserX } from 'lucide-react'
import { markNoShow, reverseNoShow } from '@/lib/actions/bookings'
import { formatBDT } from '@/lib/formatters/currency'

interface Props {
  bookingId:      string
  bookingStatus:  string
  advancePaid:    number
  customerName:   string
}

export function NoShowButton({ bookingId, bookingStatus, advancePaid, customerName }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [open, setOpen]   = useState(false)
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)

  // Reverse path — confirmation only, no modal.
  function handleReverse() {
    if (!window.confirm(`Reverse no-show for ${customerName}? The booking will return to confirmed.`)) return
    setError(null)
    startTransition(async () => {
      const r = await reverseNoShow(bookingId)
      if (!r.success) { setError(r.error); return }
      router.refresh()
    })
  }

  function handleMark() {
    setError(null)
    startTransition(async () => {
      const r = await markNoShow(bookingId, { notes: notes.trim() || undefined })
      if (!r.success) { setError(r.error); return }
      setOpen(false)
      router.refresh()
    })
  }

  if (bookingStatus === 'no_show') {
    return (
      <>
        <Button variant="outline" size="md" onClick={handleReverse} loading={pending} className="gap-1.5">
          <UserX size={14} /> Reverse no-show
        </Button>
        {error && (
          <div className="mt-2 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </>
    )
  }

  // Only confirmed bookings can be marked no-show; the action rejects others,
  // but hide the button so it doesn't look offered then refused.
  if (bookingStatus !== 'confirmed') return null

  return (
    <>
      <Button variant="outline" size="md" onClick={() => { setNotes(''); setOpen(true) }} className="gap-1.5 border-amber-300 text-amber-800 hover:bg-amber-50">
        <UserX size={14} /> Mark as No-Show
      </Button>

      <Modal open={open} onClose={() => setOpen(false)} title="Mark as No-Show">
        <div className="space-y-3">
          <p className="text-sm text-gray-700">
            <strong>{customerName}</strong> did not arrive. Marking as a no-show will:
          </p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-gray-700">
            <li>Release the room for resale (same as a cancellation)</li>
            <li>Keep the advance — it is <strong>non-refundable</strong></li>
            <li>Void any draft checkout so it doesn&apos;t sit around incomplete</li>
          </ul>

          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
            <span>
              Advance of <strong>{formatBDT(advancePaid)}</strong> already collected stays as earned revenue.
              The guest is not charged for the room balance.
            </span>
          </div>

          <Textarea
            label="Notes (optional)"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Any context — e.g. ‘Called twice, no answer’"
          />

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="md" onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="primary" size="md" loading={pending} onClick={handleMark} className="bg-amber-600 hover:bg-amber-700">
              Confirm No-Show
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
