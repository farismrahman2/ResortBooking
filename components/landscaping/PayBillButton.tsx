'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { payBill } from '@/lib/actions/landscaping'
import { formatBDT } from '@/lib/formatters/currency'
import { safeCall } from '@/lib/actions/safe-call'
import { toast } from '@/lib/toast'
import { TAP } from './ui'
import { PhotoInput } from './PhotoInput'
import { Textarea } from '@/components/ui/Textarea'

type Method = 'cash' | 'cash_past' | 'bkash' | 'bank' | 'cheque'
const r2 = (v: number) => Math.round(v * 100) / 100

/** Pay a bill in full or in part. Cash comes out of the payer's own float. */
export function PayBillButton({ billId, due, label, cashInHand }: {
  billId: string; due: number; label: string
  /** The payer's own cash in hand, shown next to the Cash option when known. */
  cashInHand?: number | null
}) {
  const router = useRouter()
  const dueR = r2(due)
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()
  const [amount, setAmount] = useState(String(dueR))
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [method, setMethod] = useState<Method>('cash')
  const [reference, setReference] = useState('')
  const [slip, setSlip] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [tried, setTried] = useState(false)

  const value = Number(amount)
  const amountError = !amount.trim() || !Number.isFinite(value) || value <= 0
    ? 'Enter the amount paid'
    : value > dueR + 0.005 ? `Only ${formatBDT(dueR)} is due on this bill` : undefined
  const showAmountError = amountError && (tried || (Number.isFinite(value) && value > dueR + 0.005))
  const cashShort = method === 'cash' && typeof cashInHand === 'number' && Number.isFinite(value) && value > cashInHand + 0.005

  function openModal() {
    setAmount(String(dueR)); setMethod('cash'); setReference(''); setSlip(null); setNote(''); setTried(false); setOpen(true)
  }

  function save() {
    setTried(true)
    if (amountError) return
    start(async () => {
      const r = await safeCall(() => payBill({ bill_id: billId, amount: value, pay_date: date, method: method === 'cash_past' ? 'cash' : method, from_float: method !== 'cash_past', reference, photo_path: slip, note }))
      if (!r.success) { toast.error(r.error); return }
      toast.success(value >= dueR - 0.005 ? 'Bill paid in full' : 'Part payment saved')
      setOpen(false); router.refresh()
    })
  }

  const cashLabel = typeof cashInHand === 'number'
    ? `Cash — from my cash in hand (${formatBDT(cashInHand)})`
    : 'Cash — from my cash in hand'

  return (
    <>
      <Button variant="secondary" size="md" className={TAP} onClick={openModal}>Pay</Button>
      <Modal open={open} onClose={() => setOpen(false)} title={`Pay ${label.trim()}`}
        footer={<>
          <Button variant="outline" size="md" className={TAP} onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="primary" size="md" className={TAP} loading={pending} onClick={save}>Save payment</Button>
        </>}>
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700">
            <span>Due: <b className="tabular-nums text-red-600">{formatBDT(dueR)}</b></span>
            <span className="text-xs text-gray-500">Enter less for a part payment.</span>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Input label="Amount (Tk)" type="number" step="any" inputMode="decimal" min={0} max={dueR}
                value={amount} onChange={(e) => setAmount(e.target.value)} error={showAmountError ? amountError : undefined} />
              {Math.abs(value - dueR) > 0.005 && (
                <button type="button" onClick={() => setAmount(String(dueR))}
                  className={`${TAP} mt-1 inline-flex items-center rounded-lg px-2 text-sm font-medium text-forest-700 hover:bg-forest-50`}>
                  Paid in full ({formatBDT(dueR)})
                </button>
              )}
            </div>
            <Input label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <Select label="Paid by" value={method} onChange={(e) => setMethod(e.target.value as Method)} className={TAP}
            hint={method === 'cash' && typeof cashInHand === 'number' ? `Your cash in hand: ${formatBDT(cashInHand)}` : undefined}
            options={[
              { value: 'cash', label: cashLabel },
              { value: 'cash_past', label: 'Cash — paid before the system (not from my cash in hand)' },
              { value: 'bkash', label: 'bKash' },
              { value: 'bank', label: 'Bank transfer' },
              { value: 'cheque', label: 'Cheque' },
            ]} />
          {cashShort && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              This is more than your cash in hand ({formatBDT(cashInHand as number)}). You can still save it — your cash in hand will go below zero.
            </p>
          )}
          <Input label="Reference (optional)"
            placeholder={method === 'bkash' ? 'bKash TrxID' : method === 'cheque' ? 'Cheque no.' : method === 'bank' ? 'Bank reference' : 'Receipt no.'}
            value={reference} onChange={(e) => setReference(e.target.value)} />
          <PhotoInput value={slip} onChange={setSlip} label="Payment slip — receipt / challan (optional, can add later)" />
          <Textarea label="Remarks (optional)" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      </Modal>
    </>
  )
}
