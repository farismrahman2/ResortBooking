'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2, AlertCircle, Banknote } from 'lucide-react'
import { NumberInput } from '@/components/ui/NumberInput'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { addAdvancePayment, deleteAdvancePayment } from '@/lib/actions/bookings'
import { safeCall } from '@/lib/actions/safe-call'
import { toast } from '@/lib/toast'
import { formatBDT } from '@/lib/formatters/currency'
import {
  ADVANCE_METHODS, ADVANCE_METHOD_LABEL,
  type AdvancePaymentRow, type AdvanceMethod,
} from '@/lib/bookings/advance-methods'

/** 'YYYY-MM-DDTHH:mm' in Dhaka time — what a datetime-local input expects. */
function nowDhakaLocal(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date())
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? '00'
  return `${g('year')}-${g('month')}-${g('day')}T${g('hour')}:${g('minute')}`
}

function fmtWhen(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Dhaka',
  })
}

/**
 * The advance ledger.
 *
 * Advances arrive in steps — ৳20,000 by bKash today, the rest by bank transfer
 * next week. Each instalment is its own line with the date, the time and the
 * method it came through, so the booking shows how the money actually arrived
 * and the money-received report can bucket each part on its own day.
 */
export function AdvancePaymentsPanel({
  bookingId, payments, advanceRequired, disabled, accounts = [],
}: {
  bookingId:       string
  payments:        AdvancePaymentRow[]
  advanceRequired: number
  disabled?:       boolean
  /** Where the money lands — banks, wallets, terminals. */
  accounts?:       Array<{ id: string; display_name: string; method: string; bank_name: string | null }>
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [open, setOpen]  = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [amount, setAmount] = useState(0)
  const [method, setMethod] = useState<AdvanceMethod>('bkash')
  const [paidAt, setPaidAt] = useState(nowDhakaLocal)
  const [reference, setReference] = useState('')
  // Default the destination to the first account for the chosen tender.
  const matching = accounts.filter((a) => a.method === method)
  const [accountId, setAccountId] = useState<string>('')
  const effectiveAccountId = accountId || matching[0]?.id || ''

  const total = payments.reduce((s, p) => s + p.amount, 0)
  const due   = Math.max(0, advanceRequired - total)

  function submit() {
    if (amount <= 0) { setError('Enter the amount received'); return }
    setError(null)
    start(async () => {
      const r = await safeCall(() => addAdvancePayment(bookingId, {
        amount, method, paid_at: paidAt, reference: reference || null,
        account_id: effectiveAccountId || null,
      }))
      if (!r.success) { setError(r.error); return }
      toast.success(`${formatBDT(amount)} logged — ${ADVANCE_METHOD_LABEL[method]}`)
      setAmount(0); setReference(''); setAccountId(''); setPaidAt(nowDhakaLocal()); setOpen(false)
      router.refresh()
    })
  }

  function remove(id: string) {
    if (!confirm('Remove this advance instalment? The advance total will be recalculated.')) return
    start(async () => {
      const r = await safeCall(() => deleteAdvancePayment(id))
      if (!r.success) { toast.error(r.error); return }
      toast.success('Instalment removed')
      router.refresh()
    })
  }

  return (
    <div className="space-y-3 border-t border-gray-100 pt-4">
      <div className="flex items-center justify-between">
        <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-gray-500">
          <Banknote size={13} /> Advance payments
        </h4>
        <span className="font-mono text-sm font-bold text-gray-900">{formatBDT(total)}</span>
      </div>

      {payments.length === 0 ? (
        <p className="rounded-lg border border-dashed border-gray-300 px-3 py-3 text-center text-xs text-gray-500">
          No advance logged yet.
        </p>
      ) : (
        <ul className="divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-200">
          {payments.map((p) => (
            <li key={p.id} className="flex items-center gap-2 px-3 py-2">
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-gray-900">
                  {formatBDT(p.amount)}
                  <span className="ml-1.5 rounded-full bg-forest-50 px-1.5 py-0.5 text-[10px] font-semibold text-forest-800">
                    {ADVANCE_METHOD_LABEL[p.method] ?? p.method}
                  </span>
                </span>
                <span className="block text-[11px] text-gray-500">
                  {fmtWhen(p.paid_at)}
                  {p.reference ? ` · ref ${p.reference}` : ''}
                </span>
              </span>
              {!disabled && (
                <button
                  type="button" onClick={() => remove(p.id)} disabled={pending}
                  aria-label="Remove instalment"
                  className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-red-500 disabled:opacity-40"
                >
                  <Trash2 size={13} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {due > 0 && payments.length > 0 && (
        <p className="text-xs text-amber-700">
          {formatBDT(due)} of the required advance is still outstanding.
        </p>
      )}

      {error && (
        <p className="flex items-start gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          <AlertCircle size={13} className="mt-0.5 flex-shrink-0" /> {error}
        </p>
      )}

      {!disabled && (open ? (
        <div className="space-y-2 rounded-lg border border-forest-200 bg-forest-50/40 p-3">
          <div className="grid grid-cols-2 gap-2">
            <NumberInput label="Amount received" prefix="৳" value={amount} onChange={setAmount} />
            <div>
              <label className="field-label">Received via</label>
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value as AdvanceMethod)}
                className="min-h-[42px] w-full rounded-lg border border-gray-300 bg-white px-2 text-sm"
              >
                {ADVANCE_METHODS.map((m) => (
                  <option key={m} value={m}>{ADVANCE_METHOD_LABEL[m]}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="field-label">When it arrived</label>
              <input
                type="datetime-local" value={paidAt}
                onChange={(e) => setPaidAt(e.target.value)}
                className="min-h-[42px] w-full rounded-lg border border-gray-300 px-2 text-sm"
              />
            </div>
            <Input
              label="Reference (optional)"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="bKash trx / slip no."
            />
          </div>
          {accounts.length > 0 && (
            <div>
              <label className="field-label">Landed in</label>
              <select
                value={effectiveAccountId}
                onChange={(e) => setAccountId(e.target.value)}
                className="min-h-[42px] w-full rounded-lg border border-gray-300 bg-white px-2 text-sm"
              >
                <option value="">— not specified —</option>
                {(matching.length ? matching : accounts).map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.display_name}{a.bank_name ? ` · ${a.bank_name}` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="md" className="flex-1"
              onClick={() => { setOpen(false); setError(null) }}>
              Cancel
            </Button>
            <Button type="button" variant="primary" size="md" className="flex-1"
              loading={pending} onClick={submit}>
              Log payment
            </Button>
          </div>
        </div>
      ) : (
        <Button type="button" variant="outline" size="md" className="w-full gap-1.5"
          onClick={() => { setOpen(true); setPaidAt(nowDhakaLocal()) }}>
          <Plus size={14} /> Log an advance payment
        </Button>
      ))}
    </div>
  )
}
