'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { addBill } from '@/lib/actions/landscaping'
import { formatReqNo } from '@/lib/landscaping/money'
import { formatBDT } from '@/lib/formatters/currency'
import { safeCall } from '@/lib/actions/safe-call'
import { toast } from '@/lib/toast'
import { PhotoInput } from './PhotoInput'

/** Record a supplier's bill/challan against an approved requisition. */
export function BillForm({ requisitions, suppliers, fixedRequisitionId, label = 'Add bill' }: {
  requisitions: Array<{ id: string; req_no: number; description: string; total: number; project_code: string | null }>
  suppliers: Array<{ id: string; name: string }>
  fixedRequisitionId?: string
  label?: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()
  const [reqId, setReqId] = useState(fixedRequisitionId ?? '')
  const [supplierId, setSupplierId] = useState('')
  const [newSupplier, setNewSupplier] = useState('')
  const [billNo, setBillNo] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [photo, setPhoto] = useState<string | null>(null)

  function save() {
    start(async () => {
      const r = await safeCall(() => addBill({
        requisition_id: reqId, supplier_id: supplierId === '__new' ? undefined : supplierId,
        new_supplier: supplierId === '__new' ? newSupplier : undefined,
        bill_no: billNo, bill_date: date, amount: Number(amount), note, photo_path: photo,
      }))
      if (!r.success) { toast.error(r.error); return }
      if (r.data.overBy > 0) toast.error(`Saved — but bills are now ${formatBDT(r.data.overBy)} over the approved requisition. The admin has been told.`)
      else toast.success('Bill recorded')
      setOpen(false); setBillNo(''); setAmount(''); setNote(''); setPhoto(null); setNewSupplier(''); setSupplierId('')
      router.refresh()
    })
  }

  const select = 'min-h-[42px] w-full rounded-lg border border-gray-300 bg-white px-3 text-sm focus:border-forest-600 focus:outline-none'
  return (
    <>
      <Button variant="primary" size="sm" className="gap-1.5" onClick={() => setOpen(true)}><Plus size={14} /> {label}</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Supplier bill / challan">
        <div className="space-y-3">
          {!fixedRequisitionId && (
            <div>
              <label className="field-label">Requisition (approved)</label>
              <select className={select} value={reqId} onChange={(e) => setReqId(e.target.value)}>
                <option value="">— Choose —</option>
                {requisitions.map((r) => (
                  <option key={r.id} value={r.id}>Req {formatReqNo(r.req_no)}{r.project_code ? ` · ${r.project_code}` : ''} · {r.description} ({formatBDT(r.total)})</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="field-label">Supplier</label>
            <select className={select} value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
              <option value="">— Choose —</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              <option value="__new">+ New supplier…</option>
            </select>
          </div>
          {supplierId === '__new' && <Input label="New supplier name" placeholder="Al-Baraka Steel Corporation" value={newSupplier} onChange={(e) => setNewSupplier(e.target.value)} />}
          <div className="grid grid-cols-2 gap-3">
            <Input label="Bill / challan no." value={billNo} onChange={(e) => setBillNo(e.target.value)} />
            <Input label="Bill date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <Input label="Bill total (Tk)" type="number" step="any" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <Input label="Note (optional)" placeholder="e.g. 10mm rod 3,500 kg" value={note} onChange={(e) => setNote(e.target.value)} />
          <PhotoInput value={photo} onChange={setPhoto} />
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" size="md" onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="primary" size="md" loading={pending} onClick={save}>Save bill</Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
