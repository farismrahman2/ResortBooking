'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { NumberInput } from '@/components/ui/NumberInput'
import { Textarea } from '@/components/ui/Textarea'
import { Users, AlertCircle, AlertTriangle } from 'lucide-react'
import { adjustActualGuestCount } from '@/lib/actions/checkout'

interface Props {
  checkoutId:     string
  bookedAdults:   number
  bookedChildren: number
  current?: {
    adults:   number | null
    children: number | null
    reason:   string | null
  } | null
  disabled?: boolean
}

export function GuestCountAdjustButton({
  checkoutId, bookedAdults, bookedChildren, current, disabled,
}: Props) {
  const router  = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [adults,   setAdults]   = useState<number>(current?.adults   ?? bookedAdults)
  const [children, setChildren] = useState<number>(current?.children ?? bookedChildren)
  const [reason,   setReason]   = useState<string>(current?.reason   ?? '')

  const hasAdjustment = current && current.adults !== null && current.children !== null

  function close() {
    setError(null)
    setAdults(current?.adults ?? bookedAdults)
    setChildren(current?.children ?? bookedChildren)
    setReason(current?.reason ?? '')
    setOpen(false)
  }

  function submit() {
    setError(null)
    if (reason.trim().length < 2) { setError('Reason is required (this will be flagged for admin review).'); return }
    startTransition(async () => {
      const r = await adjustActualGuestCount(checkoutId, {
        actual_adults:   adults,
        actual_children: children,
        reason,
      })
      if (!r.success) { setError(r.error); return }
      setOpen(false)
      router.refresh()
    })
  }

  if (disabled && !hasAdjustment) return null

  return (
    <>
      {hasAdjustment ? (
        <div className="rounded-xl border border-orange-200 bg-orange-50 p-3 space-y-1.5 text-xs">
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-semibold text-orange-900 inline-flex items-center gap-1">
              <Users size={12} /> Actual guest count
            </span>
            <span className="font-mono tabular-nums text-orange-900">
              {current?.adults}A / {current?.children}C
              <span className="text-orange-500 ml-1">(booked: {bookedAdults}A / {bookedChildren}C)</span>
            </span>
          </div>
          {current?.reason && (
            <p className="text-[11px] text-orange-800 italic">&ldquo;{current.reason}&rdquo;</p>
          )}
          {!disabled && (
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(true)} className="-ml-2">
              Edit
            </Button>
          )}
        </div>
      ) : (
        <Button type="button" variant="outline" size="md" onClick={() => setOpen(true)} className="gap-1.5 w-full">
          <Users size={14} /> Adjust actual guest count
        </Button>
      )}

      <Modal open={open} onClose={close} title="Adjust Actual Guest Count">
        <div className="space-y-3">
          <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
            <span>
              This is <strong>audit-only</strong> — it does NOT change the bill. To actually refund the
              guest for fewer attendees, apply a discount. This adjustment is flagged for admin review.
            </span>
          </div>

          <p className="text-xs text-gray-600">
            Booked: <strong>{bookedAdults} adult{bookedAdults === 1 ? '' : 's'}, {bookedChildren} child{bookedChildren === 1 ? '' : 'ren'}</strong>
          </p>

          <div className="grid grid-cols-2 gap-3">
            <NumberInput label="Actual adults"   value={adults}   onChange={setAdults} />
            <NumberInput label="Actual children" value={children} onChange={setChildren} />
          </div>

          <Textarea
            label="Reason (required)"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why did fewer guests arrive? (visible to admin)"
          />

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" size="md" onClick={close}>Cancel</Button>
            <Button type="button" variant="primary" size="md" loading={pending} onClick={submit}>
              {hasAdjustment ? 'Update' : 'Record Adjustment'}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
