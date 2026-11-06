'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Send } from 'lucide-react'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/Textarea'
import { NumberInput } from '@/components/ui/NumberInput'
import { createChangeRequest, type ChangeKind, type ChangeRequestRow } from '@/lib/actions/change-requests'
import { safeCall } from '@/lib/actions/safe-call'
import { toast } from '@/lib/toast/store'
import { formatBDT } from '@/lib/formatters/currency'

const KINDS: Array<{ value: ChangeKind; label: string }> = [
  { value: 'discount', label: 'Discount' },
  { value: 'advance',  label: 'Advance payment received' },
  { value: 'cancel',   label: 'Cancel the booking' },
  { value: 'other',    label: 'Something else' },
]
const STATUS = {
  pending:  'bg-amber-50 text-amber-800 border-amber-200',
  approved: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  rejected: 'bg-red-50 text-red-700 border-red-200',
} as const

/** Corporate Sales, on their own booking: ask the admin for money/cancel changes. */
export function ChangeRequestPanel({ bookingId, requests }: { bookingId: string; requests: ChangeRequestRow[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [kind, setKind] = useState<ChangeKind>('discount')
  const [discount, setDiscount] = useState(0)
  const [discountPct, setDiscountPct] = useState(0)
  const [amount, setAmount] = useState(0)
  const [method, setMethod] = useState('bkash')
  const [note, setNote] = useState('')

  function submit() {
    start(async () => {
      const r = await safeCall(() => createChangeRequest({ bookingId, kind, note, discount, discount_pct: discountPct, amount, method }))
      if (!r.success) { toast.error(r.error); return }
      toast.success('Sent to the admin for approval')
      setNote(''); setDiscount(0); setDiscountPct(0); setAmount(0)
      router.refresh()
    })
  }

  return (
    <Card>
      <CardHeader><CardTitle>Request a change</CardTitle></CardHeader>
      <div className="space-y-3">
        <p className="text-xs text-gray-500">
          Discounts, payments and cancelling need the admin&apos;s approval. Guest details, guest numbers, rooms and dates you can change yourself above.
        </p>
        <select value={kind} onChange={(e) => setKind(e.target.value as ChangeKind)}
          className="min-h-[42px] w-full rounded-lg border border-gray-300 bg-white px-3 text-sm focus:border-forest-600 focus:outline-none">
          {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
        </select>
        {kind === 'discount' && (
          <div className="grid grid-cols-2 gap-3">
            <NumberInput label="New flat discount" prefix="৳" value={discount} onChange={setDiscount} min={0} />
            <NumberInput label="or discount %" suffix="%" value={discountPct} onChange={setDiscountPct} min={0} />
          </div>
        )}
        {kind === 'advance' && (
          <div className="grid grid-cols-2 gap-3">
            <NumberInput label="Amount received" prefix="৳" value={amount} onChange={setAmount} min={0} />
            <div>
              <label className="field-label">Received via</label>
              <select value={method} onChange={(e) => setMethod(e.target.value)}
                className="min-h-[42px] w-full rounded-lg border border-gray-300 bg-white px-3 text-sm focus:border-forest-600 focus:outline-none">
                <option value="bkash">bKash</option>
                <option value="bank_transfer">Bank transfer</option>
                <option value="cash">Cash</option>
              </select>
            </div>
          </div>
        )}
        <Textarea label={kind === 'cancel' || kind === 'other' ? 'What and why' : 'Note (optional)'} value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
        <Button variant="primary" size="sm" className="w-full gap-1.5" loading={pending} onClick={submit}>
          <Send size={13} /> Send for approval
        </Button>

        {requests.length > 0 && (
          <ul className="divide-y divide-gray-100 border-t border-gray-100 pt-1">
            {requests.map((r) => (
              <li key={r.id} className="py-2 text-xs">
                <div className="flex items-center gap-2">
                  <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-semibold uppercase ${STATUS[r.status]}`}>{r.status}</span>
                  <span className="font-medium text-gray-800">{KINDS.find((k) => k.value === r.kind)?.label}</span>
                  {r.kind === 'discount' && <span className="text-gray-600">{[r.details.discount ? formatBDT(r.details.discount) : null, r.details.discount_pct ? `${r.details.discount_pct}%` : null].filter(Boolean).join(' + ')}</span>}
                  {r.kind === 'advance' && <span className="text-gray-600">{formatBDT(r.details.amount ?? 0)}</span>}
                  <span className="ml-auto text-gray-400">{new Date(r.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
                </div>
                {r.note && <p className="mt-0.5 text-gray-500">{r.note}</p>}
                {r.decision_note && <p className="mt-0.5 text-gray-700">Admin: {r.decision_note}</p>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  )
}
