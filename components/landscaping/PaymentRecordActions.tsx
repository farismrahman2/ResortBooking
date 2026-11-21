'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Upload } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { setRequisitionSlip, updatePaymentRecord } from '@/lib/actions/landscaping'
import { safeCall } from '@/lib/actions/safe-call'
import { toast } from '@/lib/toast'
import { PhotoInput } from './PhotoInput'
import { TAP } from './ui'

type Method = 'cash' | 'bkash' | 'bank' | 'cheque'

/** Edit one payment record: slip and remarks (who entered it, or admin); amount/date/method (admin). */
export function EditPaymentButton({ payment, isAdmin, canEdit }: {
  payment: { id: string; amount: number; pay_date: string; method: string; reference: string | null; note: string | null; photo_path: string | null }
  isAdmin: boolean
  canEdit: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()
  const [photo, setPhoto] = useState<string | null>(payment.photo_path)
  const [note, setNote] = useState(payment.note ?? '')
  const [reference, setReference] = useState(payment.reference ?? '')
  const [amount, setAmount] = useState(String(payment.amount))
  const [date, setDate] = useState(payment.pay_date)
  const [method, setMethod] = useState<Method>(payment.method as Method)
  if (!canEdit) return null
  const missing = !payment.photo_path

  function save() {
    start(async () => {
      const r = await safeCall(() => updatePaymentRecord(payment.id, {
        photo_path: photo, note, reference,
        ...(isAdmin ? { amount: Number(amount), pay_date: date, method } : {}),
      }))
      if (!r.success) { toast.error(r.error); return }
      toast.success('Payment record updated'); setOpen(false); router.refresh()
    })
  }
  return (
    <>
      <Button size="md" variant={missing ? 'primary' : 'outline'} className={`${TAP} gap-1.5`} onClick={() => setOpen(true)}>
        {missing ? <><Upload size={14} /> Add slip</> : <><Pencil size={14} /> Edit</>}
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Payment record"
        footer={<><Button variant="outline" size="md" className={TAP} onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" size="md" className={TAP} loading={pending} onClick={save}>Save</Button></>}>
        <div className="space-y-3">
          <PhotoInput value={photo} onChange={setPhoto} label="Payment slip — receipt / challan" />
          {isAdmin ? (
            <div className="grid grid-cols-2 gap-3">
              <Input label="Amount (Tk)" type="number" step="any" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
              <Input label="Payment date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              <Select label="Paid by" value={method} onChange={(e) => setMethod(e.target.value as Method)}>
                <option value="cash">Cash</option><option value="bkash">bKash</option><option value="bank">Bank</option><option value="cheque">Cheque</option>
              </Select>
              <Input label="Reference" value={reference} onChange={(e) => setReference(e.target.value)} />
            </div>
          ) : (
            <>
              <Input label="Reference" value={reference} onChange={(e) => setReference(e.target.value)} />
              <p className="text-xs text-gray-500">Only the admin can change the amount, date or method.</p>
            </>
          )}
          <Textarea label="Remarks" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      </Modal>
    </>
  )
}

/** Attach the signed, approved requisition slip (admin can replace one). */
export function RequisitionSlipButton({ requisitionId, hasSlip, isAdmin }: { requisitionId: string; hasSlip: boolean; isAdmin: boolean }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()
  const [photo, setPhoto] = useState<string | null>(null)
  if (hasSlip && !isAdmin) return null
  function save() {
    if (!photo) { toast.error('Take or choose the slip photo'); return }
    start(async () => {
      const r = await safeCall(() => setRequisitionSlip(requisitionId, photo))
      if (!r.success) { toast.error(r.error); return }
      toast.success('Requisition slip saved'); setOpen(false); setPhoto(null); router.refresh()
    })
  }
  return (
    <>
      <Button size="md" variant={hasSlip ? 'outline' : 'primary'} className={`${TAP} gap-1.5`} onClick={() => setOpen(true)}>
        <Upload size={14} /> {hasSlip ? 'Replace slip' : 'Add approved slip'}
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title={hasSlip ? 'Replace the approved requisition slip' : 'Approved requisition slip'}
        footer={<><Button variant="outline" size="md" className={TAP} onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" size="md" className={TAP} loading={pending} onClick={save}>Save</Button></>}>
        <PhotoInput value={photo} onChange={setPhoto} label="Photo or PDF of the signed slip" />
        {hasSlip && <p className="mt-2 text-xs text-gray-500">Replacing it is recorded in the Audit Log.</p>}
      </Modal>
    </>
  )
}
