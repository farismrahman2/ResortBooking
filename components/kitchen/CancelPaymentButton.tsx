'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Ban } from 'lucide-react'
import { toast } from '@/lib/toast'
import { cancelPayment } from '@/lib/actions/kitchen-ledger'
import { safeCall } from '@/lib/actions/safe-call'

/**
 * Cancelling a payment — a bounced or voided cheque.
 *
 * The row stays with its reason rather than being deleted. Every balance query
 * filters on payment status, so a cancelled cheque stops counting toward what
 * a supplier is owed while remaining exactly what somebody needs to find when
 * the bank statement doesn't match.
 */
export function CancelPaymentButton({ paymentId }: { paymentId: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')

  if (!open) {
    return (
      <button
        type="button" onClick={() => setOpen(true)}
        className="flex min-h-[40px] w-full items-center justify-center gap-1.5 rounded-xl border border-red-200 text-xs font-medium text-red-600"
      >
        <Ban size={13} /> Cancel this payment
      </button>
    )
  }

  return (
    <div className="space-y-2 rounded-xl border border-red-300 bg-white p-3">
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-gray-700">Why?</span>
        <input
          value={reason} onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. cheque bounced"
          autoFocus
          className="min-h-[42px] w-full rounded-lg border border-gray-300 px-2.5 text-sm"
        />
      </label>
      <div className="flex gap-2">
        <button
          type="button" onClick={() => { setOpen(false); setReason('') }}
          className="min-h-[40px] flex-1 rounded-lg border border-gray-300 text-xs font-medium text-gray-700"
        >
          Keep it
        </button>
        <button
          type="button"
          disabled={pending || reason.trim().length < 2}
          onClick={() => start(async () => {
            const r = await safeCall(() => cancelPayment(paymentId, reason))
            if (!r.success) { toast.error(r.error); return }
            toast.success('Payment cancelled')
            setOpen(false)
            router.refresh()
          })}
          className="min-h-[40px] flex-1 rounded-lg bg-red-600 text-xs font-semibold text-white disabled:opacity-50"
        >
          {pending ? 'Cancelling…' : 'Confirm'}
        </button>
      </div>
    </div>
  )
}
