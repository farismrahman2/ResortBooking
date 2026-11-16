'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { payBill } from '@/lib/actions/landscaping'
import { formatBDT } from '@/lib/formatters/currency'
import { safeCall } from '@/lib/actions/safe-call'
import { toast } from '@/lib/toast'

/** Pay a bill in full or in part. Cash comes out of the payer's own float. */
export function PayBillButton({ billId, due, label }: { billId: string; due: number; label: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()
  const [amount, setAmount] = useState(String(due))
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [method, setMethod] = useState<'cash' | 'cash_past' | 'bkash' | 'bank' | 'cheque'>('cash')
  const [reference, setReference] = useState('')

  function save() {
    start(async () => {
      const r = await safeCall(() => payBill({ bill_id: billId, amount: Number(amount), pay_date: date, method: method === 'cash_past' ? 'cash' : method, from_float: method !== 'cash_past', reference }))
      if (!r.success) { toast.error(r.error); return }
      toast.success(Number(amount) >= due ? 'Bill paid' : 'Part payment recorded')
      setOpen(false); router.refresh()
    })
  }

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => { setAmount(String(due)); setOpen(true) }}>Pay</Button>
      <Modal open={open} onClose={() => setOpen(false)} title={`Pay ${label}`}>
        <div className="space-y-3">
          <p className="text-sm text-gray-600">Still due: <b className="text-gray-900">{formatBDT(due)}</b>. Enter less for a part payment.</p>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Amount (Tk)" type="number" step="any" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
            <Input label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <label className="field-label">Paid by</label>
            <select value={method} onChange={(e) => setMethod(e.target.value as typeof method)}
              className="min-h-[42px] w-full rounded-lg border border-gray-300 bg-white px-3 text-sm focus:border-forest-600 focus:outline-none">
              <option value="cash">Cash (from my cash in hand)</option>
              <option value="cash_past">Cash — paid before the system (not from my cash in hand)</option>
              <option value="bkash">bKash</option>
              <option value="bank">Bank transfer</option>
              <option value="cheque">Cheque</option>
            </select>
          </div>
          <Input label="Reference (optional)" placeholder="bKash TrxID / cheque no." value={reference} onChange={(e) => setReference(e.target.value)} />
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" size="md" onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="primary" size="md" loading={pending} onClick={save}>Record payment</Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
