'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { recordRequisitionPayment } from '@/lib/actions/landscaping'
import { formatReqNo } from '@/lib/landscaping/money'
import { formatBDT } from '@/lib/formatters/currency'
import { safeCall } from '@/lib/actions/safe-call'
import { toast } from '@/lib/toast'
import type { PayableRequisition } from '@/lib/queries/landscaping-payments'
import { MultiPhotoInput } from './MultiPhotoInput'
import { TAP } from './ui'
import { FORM_CARD, FormActionBar } from './RequisitionForm'
import { cn } from '@/lib/utils'

const today = () => new Date(Date.now() + 6 * 3600_000).toISOString().slice(0, 10)
type Method = 'cash' | 'cash_past' | 'bkash' | 'bank' | 'cheque'

/**
 * Upload an approved requisition's payment: requisition number, the signed
 * requisition slip, the payment slip, amount, date and remarks.
 */
export function RecordPaymentForm({ requisitions, suppliers, initialReqId }: {
  requisitions: PayableRequisition[]
  suppliers: Array<{ id: string; name: string }>
  initialReqId?: string
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [reqText, setReqText] = useState(() => {
    const r = requisitions.find((x) => x.id === initialReqId)
    return r ? formatReqNo(r.req_no) : ''
  })
  const req = useMemo(() => {
    const num = Number(reqText.replace(/\D/g, ''))
    return num ? requisitions.find((r) => r.req_no === num) ?? null : null
  }, [reqText, requisitions])
  const openBills = req?.bills.filter((b) => b.due > 0.005) ?? []
  const [billId, setBillId] = useState<string>('')
  const [supplierId, setSupplierId] = useState('')
  const [newSupplier, setNewSupplier] = useState('')
  const [billNo, setBillNo] = useState('')
  const [reqSlip, setReqSlip] = useState<string[]>([])
  const [paySlip, setPaySlip] = useState<string[]>([])
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(today())
  const [method, setMethod] = useState<Method>('bank')
  const [reference, setReference] = useState('')
  const [note, setNote] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Default to the first bill with money still due once a requisition is chosen.
  const chosenBill = billId === '__new' ? null : (openBills.find((b) => b.id === billId) ?? (billId === '' ? openBills[0] ?? null : null))
  const due = chosenBill?.due ?? null

  function validate() {
    const e: Record<string, string> = {}
    if (!req) e.req = reqText ? `No approved requisition ${formatReqNo(Number(reqText.replace(/\D/g, '')) || 0)}` : 'Enter or pick the requisition number'
    if (!paySlip.length) e.paySlip = 'Attach the payment slip (photo or PDF)'
    if (!(Number(amount) > 0)) e.amount = 'Enter the amount paid'
    else if (due !== null && Number(amount) > due + 0.005) e.amount = `Only ${formatBDT(due)} is due on this bill`
    if (!date) e.date = 'Pick the payment date'
    if (!chosenBill && !supplierId && !newSupplier.trim()) e.supplier = 'Who was paid?'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  function save(another: boolean) {
    if (!validate() || !req) { toast.error('Please fix the boxes marked in red'); return }
    start(async () => {
      const r = await safeCall(() => recordRequisitionPayment({
        requisition_id: req.id, requisition_slip_paths: reqSlip, payment_slip_paths: paySlip,
        amount: Number(amount), pay_date: date, method: method === 'cash_past' ? 'cash' : method, from_float: method === 'cash',
        reference, note,
        bill_id: chosenBill?.id ?? null,
        supplier_id: !chosenBill && supplierId && supplierId !== '__new' ? supplierId : null,
        new_supplier: !chosenBill && supplierId === '__new' ? newSupplier : null,
        bill_no: !chosenBill ? billNo : null,
      }))
      if (!r.success) { toast.error(r.error); return }
      toast.success(`Payment saved on Req ${formatReqNo(req.req_no)}`)
      if (another) {
        setReqText(''); setReqSlip([]); setPaySlip([]); setAmount(''); setReference(''); setNote(''); setBillId(''); setBillNo('')
        router.refresh()
      } else {
        router.push(`/landscaping/requisitions/${r.data.requisition_id}`)
      }
    })
  }

  return (
    <div className={cn(FORM_CARD, 'sm:max-w-2xl')}>
      <div>
        <Input label="Requisition No." list="ls-approved-reqs" inputMode="numeric" placeholder="e.g. 00039" value={reqText} error={errors.req}
          onChange={(e) => { setReqText(e.target.value); setBillId('') }} />
        <datalist id="ls-approved-reqs">
          {requisitions.map((r) => <option key={r.id} value={formatReqNo(r.req_no)}>{`${r.description} · ${formatBDT(r.total)}`}</option>)}
        </datalist>
        {req && (
          <div className="mt-2 rounded-lg border border-forest-200 bg-forest-50 px-3 py-2 text-sm text-forest-900">
            <b>{formatReqNo(req.req_no)}</b> · {req.description}{req.project_code ? ` · ${req.project_code}` : ''}
            <p className="text-xs text-forest-800">Approved {formatBDT(req.total)} · paid so far {formatBDT(req.paid)}</p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <MultiPhotoInput value={reqSlip} onChange={setReqSlip} label={req?.has_slip ? 'Requisition slip (already attached — add to replace)' : 'Approved requisition slip (photos or PDF)'} />
        </div>
        <div>
          <MultiPhotoInput value={paySlip} onChange={setPaySlip} label="Payment slips — receipts / challans" />
          {errors.paySlip && <p className="mt-1 text-xs text-red-600">{errors.paySlip}</p>}
        </div>
      </div>

      {req && (
        openBills.length > 0 ? (
          <Select label="Which bill is this paying?" value={billId || openBills[0].id} onChange={(e) => setBillId(e.target.value)}>
            {openBills.map((b) => <option key={b.id} value={b.id}>{b.supplier} · bill {b.bill_no ?? '—'} · due {formatBDT(b.due)}</option>)}
            <option value="__new">Another supplier / bill not entered yet</option>
          </Select>
        ) : null
      )}
      {req && !chosenBill && (
        <div className="grid grid-cols-1 gap-3 rounded-lg bg-gray-50 p-3 sm:grid-cols-2">
          <Select label="Paid to (supplier)" value={supplierId} error={errors.supplier} onChange={(e) => setSupplierId(e.target.value)}>
            <option value="">— Choose —</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            <option value="__new">+ New supplier…</option>
          </Select>
          {supplierId === '__new'
            ? <Input label="New supplier name" value={newSupplier} onChange={(e) => setNewSupplier(e.target.value)} />
            : <Input label="Bill / challan no. (optional)" value={billNo} onChange={(e) => setBillNo(e.target.value)} />}
          <p className="text-xs text-gray-500 sm:col-span-2">The supplier’s bill is recorded for the amount paid, so the requisition and supplier ledger stay correct.</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Input label="Payment amount (Tk)" type="number" step="any" inputMode="decimal" value={amount} error={errors.amount}
          hint={due !== null ? `Due on this bill: ${formatBDT(due)}` : undefined} onChange={(e) => setAmount(e.target.value)} />
        <Input label="Payment date" type="date" value={date} error={errors.date} onChange={(e) => setDate(e.target.value)} />
      </div>
      {due !== null && due > 0 && (
        <button type="button" className={`${TAP} -mt-2 px-1 text-sm font-medium text-forest-700 hover:underline`} onClick={() => setAmount(String(due))}>Paid in full ({formatBDT(due)})</button>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Select label="Paid by" value={method} onChange={(e) => setMethod(e.target.value as Method)}>
          <option value="bank">Bank</option><option value="bkash">bKash</option><option value="cheque">Cheque</option>
          <option value="cash">Cash (from my cash in hand)</option><option value="cash_past">Cash — paid before the system</option>
        </Select>
        <Input label="Reference (optional)" placeholder="Cheque / TrxID" value={reference} onChange={(e) => setReference(e.target.value)} />
      </div>
      <Textarea label="Remarks (optional)" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />

      <FormActionBar summary={amount ? <span className="font-semibold text-forest-900">Paying <span className="tabular-nums">{formatBDT(Number(amount) || 0)}</span></span> : undefined}
        secondary={<Button variant="outline" size="md" className={cn(TAP, 'px-3')} loading={pending} onClick={() => save(true)}>Save &amp; add another</Button>}
        primary={<Button variant="primary" size="md" className={TAP} loading={pending} onClick={() => save(false)}>Save</Button>} />
    </div>
  )
}
