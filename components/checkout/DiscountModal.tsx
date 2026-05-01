'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { NumberInput } from '@/components/ui/NumberInput'
import { Textarea } from '@/components/ui/Textarea'
import { AlertCircle, AlertTriangle } from 'lucide-react'
import { applyDiscount, clearDiscount } from '@/lib/actions/checkout'
import { formatBDT } from '@/lib/formatters/currency'
import { cn } from '@/lib/utils'

interface Props {
  open:        boolean
  onClose:     () => void
  checkoutId:  string
  /** Subtotal = booking.total + extra charges (before discount). Used for live percent → fixed preview. */
  subtotal:    number
  current?: {
    amount: number
    pct:    number
    reason: string | null
  } | null
}

export function DiscountModal({ open, onClose, checkoutId, subtotal, current }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [mode, setMode] = useState<'fixed' | 'percent'>(current && current.pct > 0 ? 'percent' : 'fixed')
  const [value, setValue] = useState<number>(
    current ? (current.pct > 0 ? current.pct : current.amount) : 0,
  )
  const [reason, setReason] = useState<string>(current?.reason ?? '')

  const previewAmount = mode === 'percent'
    ? Math.round((subtotal * value) / 100 * 100) / 100
    : value

  function close() {
    setError(null)
    onClose()
  }

  function submit() {
    setError(null)
    if (value <= 0) { setError('Enter a discount value greater than 0'); return }
    if (reason.trim().length < 2) { setError('Reason is required (this will be flagged for admin review).'); return }
    if (mode === 'percent' && value > 100) { setError('Percent must be 0–100'); return }
    if (mode === 'fixed' && value > subtotal) { setError(`Discount cannot exceed the bill (${formatBDT(subtotal)})`); return }
    startTransition(async () => {
      const r = await applyDiscount(checkoutId, { mode, value, reason })
      if (!r.success) { setError(r.error); return }
      onClose()
      router.refresh()
    })
  }

  function remove() {
    if (!confirm('Remove the discount from this checkout?')) return
    startTransition(async () => {
      const r = await clearDiscount(checkoutId)
      if (!r.success) { setError(r.error); return }
      onClose()
      router.refresh()
    })
  }

  return (
    <Modal open={open} onClose={close} title={current && current.amount > 0 ? 'Update Discount' : 'Apply Discount'}>
      <div className="space-y-3">
        <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
          <span>
            Discounts are <strong>against policy</strong>. Applying one will be flagged for admin review.
            Admin can see the full reason in the Audit Log.
          </span>
        </div>

        <div>
          <label className="text-[10px] uppercase tracking-wider font-semibold text-gray-600 mb-1 block">
            Discount type
          </label>
          <div className="inline-flex rounded-lg border border-gray-300 overflow-hidden">
            {(['fixed', 'percent'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={cn(
                  'px-4 py-1.5 text-sm font-medium transition-colors',
                  mode === m ? 'bg-violet-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50',
                )}
              >
                {m === 'fixed' ? 'Fixed (৳)' : 'Percentage (%)'}
              </button>
            ))}
          </div>
        </div>

        <NumberInput
          label={mode === 'fixed' ? 'Discount amount' : 'Discount percent'}
          prefix={mode === 'fixed' ? '৳' : ''}
          suffix={mode === 'percent' ? '%' : ''}
          value={value}
          onChange={setValue}
        />

        {mode === 'percent' && value > 0 && (
          <p className="text-xs text-gray-600 -mt-2">
            = <span className="font-mono font-semibold">{formatBDT(previewAmount)}</span> off a{' '}
            {formatBDT(subtotal)} bill
          </p>
        )}

        <Textarea
          label="Reason (required)"
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Why is this discount being applied? (visible to admin)"
        />

        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex items-center justify-between gap-2 border-t border-gray-100 pt-3">
          {current && current.amount > 0 ? (
            <Button type="button" variant="ghost" size="md" onClick={remove} disabled={pending}>
              Remove discount
            </Button>
          ) : <span />}
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="md" onClick={close}>Cancel</Button>
            <Button type="button" variant="primary" size="md" loading={pending} onClick={submit}>
              {current && current.amount > 0 ? 'Update' : 'Apply Discount'}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
