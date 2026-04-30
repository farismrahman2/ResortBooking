'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/Textarea'
import { NumberInput } from '@/components/ui/NumberInput'
import { Select } from '@/components/ui/Select'
import { Input } from '@/components/ui/Input'
import { AlertCircle, AlertTriangle, CheckCircle2, FileDown, RotateCcw } from 'lucide-react'
import { finalizeCheckout, voidCheckout, recordRefund } from '@/lib/actions/checkout'
import { formatBDT } from '@/lib/formatters/currency'
import { CHECKOUT_PAYMENT_METHOD_OPTIONS } from '@/components/checkout/labels'
import type { CheckoutPaymentMethod, CheckoutWithFull } from '@/lib/supabase/types'

interface Props {
  checkout: CheckoutWithFull
  /** Live computed totals (in case checkout is still draft) */
  totals: {
    advance:       number
    chargesTotal:  number
    paymentsTotal: number
    netDue:        number     // > 0 = guest owes, < 0 = refund
  }
  isAdmin: boolean
  canWrite: boolean
}

export function FinalizeAndVoid({ checkout, totals, isAdmin, canWrite }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [finalizeOpen, setFinalizeOpen] = useState(false)
  const [voidOpen, setVoidOpen]         = useState(false)
  const [voidReason, setVoidReason]     = useState('')
  const [refundOpen, setRefundOpen]     = useState(false)

  const isDraft     = checkout.status === 'draft'
  const isFinalized = checkout.status === 'finalized'
  const isRefund    = totals.netDue < 0
  const refundOutstanding = isFinalized && totals.netDue < 0 && checkout.refund_amount === 0
  const hasRefundExpense  = !!checkout.refund_expense_id

  // Refund form
  const [refundAmount, setRefundAmount] = useState<number>(Math.abs(totals.netDue))
  const [refundMethod, setRefundMethod] = useState<CheckoutPaymentMethod>('cash')
  const [refundRef, setRefundRef]       = useState('')

  function handleFinalize() {
    setError(null)
    startTransition(async () => {
      const r = await finalizeCheckout(checkout.id)
      if (!r.success) { setError(r.error); return }
      setFinalizeOpen(false)
      router.refresh()
    })
  }

  function handleVoid() {
    setError(null)
    if (voidReason.trim().length < 2) { setError('Reason is required'); return }
    startTransition(async () => {
      const r = await voidCheckout(checkout.id, { reason: voidReason })
      if (!r.success) { setError(r.error); return }
      setVoidOpen(false)
      router.refresh()
    })
  }

  function handleRefund() {
    setError(null)
    startTransition(async () => {
      const r = await recordRefund(checkout.id, {
        amount:    refundAmount,
        method:    refundMethod,
        reference: refundRef,
      })
      if (!r.success) { setError(r.error); return }
      setRefundOpen(false)
      router.refresh()
    })
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <a
          href={`/api/checkout/${checkout.booking_id}/invoice`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          <FileDown size={14} />
          Invoice PDF
        </a>

        {canWrite && isDraft && (
          <Button variant="primary" size="md" onClick={() => setFinalizeOpen(true)}>
            <CheckCircle2 size={14} /> Finalize Checkout
          </Button>
        )}

        {refundOutstanding && (
          <Button variant="secondary" size="md" onClick={() => { setRefundAmount(Math.abs(totals.netDue)); setRefundOpen(true) }}>
            Record Refund Payout
          </Button>
        )}

        {isAdmin && isFinalized && (
          <Button variant="danger" size="md" onClick={() => { setVoidReason(''); setVoidOpen(true) }}>
            <RotateCcw size={14} /> Void
          </Button>
        )}
      </div>

      {error && (
        <div className="mt-2 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Finalize confirm */}
      <Modal open={finalizeOpen} onClose={() => setFinalizeOpen(false)} title="Finalize Checkout">
        <div className="space-y-3">
          <p className="text-sm text-gray-700">
            This will lock all charges & payments, mark the booking as <strong>checked out</strong>,
            and snapshot the totals. Partial settlement is allowed — outstanding balance stays visible.
          </p>
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-1 text-sm">
            <Row label="Charges"  value={formatBDT(totals.chargesTotal)} />
            <Row label="Advance"  value={`− ${formatBDT(totals.advance)}`} />
            <Row label="Payments" value={`− ${formatBDT(totals.paymentsTotal)}`} />
            <Row
              label={isRefund ? 'Refund Due' : 'Balance'}
              value={formatBDT(Math.abs(totals.netDue))}
              bold
              className={isRefund ? 'text-teal-700' : 'text-violet-700'}
            />
          </div>
          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="md" onClick={() => setFinalizeOpen(false)}>Cancel</Button>
            <Button variant="primary" size="md" loading={pending} onClick={handleFinalize}>
              Confirm Finalize
            </Button>
          </div>
        </div>
      </Modal>

      {/* Void modal — admin only */}
      <Modal open={voidOpen} onClose={() => setVoidOpen(false)} title="Void Checkout">
        <div className="space-y-3">
          {hasRefundExpense && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
              <span>
                A refund expense of <strong>{formatBDT(Number(checkout.refund_amount))}</strong> was previously
                recorded for this checkout. Voiding will <strong>not</strong> auto-reverse it — you&apos;ll need
                to manually delete the expense from the Expenses module.
              </span>
            </div>
          )}
          <p className="text-sm text-gray-700">
            Voiding sets the booking status back to <strong>confirmed</strong>, unlocks charges/payments
            for editing, and marks this checkout as voided. Cannot be undone.
          </p>
          <Textarea
            label="Reason (required)"
            required
            rows={3}
            value={voidReason}
            onChange={(e) => setVoidReason(e.target.value)}
            placeholder="Explain why this checkout is being voided"
          />
          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="md" onClick={() => setVoidOpen(false)}>Cancel</Button>
            <Button variant="danger" size="md" loading={pending} onClick={handleVoid}>
              Confirm Void
            </Button>
          </div>
        </div>
      </Modal>

      {/* Refund modal */}
      <Modal open={refundOpen} onClose={() => setRefundOpen(false)} title="Record Refund Payout">
        <div className="space-y-3">
          <p className="text-sm text-gray-700">
            Recording a refund creates a matching expense row in the <strong>Guest Refund</strong> category
            (or fallback to Miscellaneous). It does <em>not</em> move money — that&apos;s done out-of-band.
          </p>
          <NumberInput label="Amount" prefix="৳" value={refundAmount} onChange={setRefundAmount} />
          <Select label="Method" value={refundMethod} onChange={(e) => setRefundMethod(e.target.value as CheckoutPaymentMethod)}>
            {CHECKOUT_PAYMENT_METHOD_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </Select>
          <Input
            label="Reference (optional)"
            placeholder="bKash trxId, cheque #, etc."
            value={refundRef}
            onChange={(e) => setRefundRef(e.target.value)}
          />
          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="md" onClick={() => setRefundOpen(false)}>Cancel</Button>
            <Button variant="primary" size="md" loading={pending} onClick={handleRefund}>
              Record Refund
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}

function Row({ label, value, bold, className }: { label: string; value: string; bold?: boolean; className?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className={bold ? 'font-semibold text-gray-900' : 'text-gray-600'}>{label}</span>
      <span className={`font-mono tabular-nums ${bold ? 'font-bold' : ''} ${className ?? ''}`}>{value}</span>
    </div>
  )
}
