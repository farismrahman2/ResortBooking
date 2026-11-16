'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Check, Plus } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { addBill } from '@/lib/actions/landscaping'
import { formatReqNo } from '@/lib/landscaping/money'
import { formatBDT } from '@/lib/formatters/currency'
import { safeCall } from '@/lib/actions/safe-call'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/utils'
import { PhotoInput } from './PhotoInput'
import { TAP } from './ui'

type Req = {
  id: string; req_no: number; description: string; total: number; project_code: string | null
  /** Already billed on this requisition (optional — older callers don't pass it). */
  billed?: number
  /** Approved total minus billed. */
  left?: number
}
type Errors = { req?: string; supplier?: string; amount?: string }

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9ঀ-৿]+/g, ' ').trim()
const short = (s: string, max = 38) => (s.length > max ? `${s.slice(0, max - 1)}…` : s)
const leftOf = (r: Req | undefined) => (r ? (typeof r.left === 'number' ? r.left : typeof r.billed === 'number' ? r.total - r.billed : undefined) : undefined)

/** Record a supplier's bill/challan against an approved requisition. */
export function BillForm({ requisitions, suppliers, fixedRequisitionId, fixedLeft, label = 'Add bill' }: {
  requisitions: Req[]
  suppliers: Array<{ id: string; name: string }>
  fixedRequisitionId?: string
  /** For a fixed requisition: how much is still left to bill (enables the over-budget warning). */
  fixedLeft?: number
  label?: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()
  const [reqId, setReqId] = useState(fixedRequisitionId ?? '')
  const [supplierText, setSupplierText] = useState('')
  const [billNo, setBillNo] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [photo, setPhoto] = useState<string | null>(null)
  const [errors, setErrors] = useState<Errors>({})

  // ── Supplier type-ahead ──
  const typed = norm(supplierText)
  const exact = useMemo(() => (typed ? suppliers.find((s) => norm(s.name) === typed) : undefined), [suppliers, typed])
  const matches = useMemo(() => {
    if (!typed || exact) return []
    const head = typed.slice(0, 4)
    return suppliers.filter((s) => {
      const n = norm(s.name)
      return n.includes(typed) || (typed.length >= 4 && typed.includes(n)) || (typed.length >= 3 && n.startsWith(head))
    }).slice(0, 6)
  }, [suppliers, typed, exact])

  // ── Budget ──
  const req = fixedRequisitionId ? requisitions.find((r) => r.id === fixedRequisitionId) : requisitions.find((r) => r.id === reqId)
  const left = fixedRequisitionId ? (fixedLeft ?? leftOf(req)) : leftOf(req)
  const amt = Number(amount)
  const overBy = typeof left === 'number' && Number.isFinite(amt) && amt > 0 ? Math.round((amt - Math.max(left, 0)) * 100) / 100 : 0

  function reset() {
    setReqId(fixedRequisitionId ?? ''); setSupplierText(''); setBillNo(''); setAmount(''); setNote(''); setPhoto(null); setErrors({})
    setDate(new Date().toISOString().slice(0, 10))
  }

  function validate(): Errors {
    const e: Errors = {}
    if (!reqId) e.req = 'Choose the requisition this bill is for'
    if (!supplierText.trim()) e.supplier = 'Type or pick the supplier'
    if (!amount.trim() || !Number.isFinite(amt) || amt <= 0) e.amount = 'Enter the bill total'
    return e
  }

  function save() {
    const e = validate()
    setErrors(e)
    if (Object.keys(e).length) return
    start(async () => {
      const r = await safeCall(() => addBill({
        requisition_id: reqId,
        supplier_id: exact?.id,
        new_supplier: exact ? undefined : supplierText.trim(),
        bill_no: billNo, bill_date: date, amount: amt, note, photo_path: photo,
      }))
      if (!r.success) {
        if (/requisition/i.test(r.error)) setErrors({ req: r.error })
        else if (/supplier/i.test(r.error)) setErrors({ supplier: r.error })
        else if (/amount/i.test(r.error)) setErrors({ amount: r.error })
        toast.error(r.error); return
      }
      if (r.data.overBy > 0) toast.error(`Saved — but bills are now ${formatBDT(r.data.overBy)} over the approved requisition. The admin has been told.`)
      else toast.success('Bill saved')
      setOpen(false); reset()
      router.refresh()
    })
  }

  return (
    <>
      <Button variant="primary" size="md" className={cn(TAP, 'gap-1.5')} onClick={() => { setErrors({}); setOpen(true) }}><Plus size={15} /> {label}</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Add bill"
        footer={<>
          <Button variant="outline" size="md" className={TAP} onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="primary" size="md" className={TAP} loading={pending} onClick={save}>Save bill</Button>
        </>}>
        <div className="space-y-3">
          <p className="text-xs text-gray-500">A supplier&apos;s bill or challan, against an approved requisition.</p>

          {!fixedRequisitionId && (
            requisitions.length === 0 ? (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                No approved requisitions yet. A requisition must be approved before a bill can be added.
              </p>
            ) : (
              <div>
                <Select label="Requisition (approved)" required value={reqId} className={TAP} error={errors.req}
                  onChange={(e) => { setReqId(e.target.value); setErrors((x) => ({ ...x, req: undefined })) }}>
                  <option value="">— Choose —</option>
                  {requisitions.map((r) => {
                    const l = leftOf(r)
                    const tail = typeof l === 'number' ? (l > 0.005 ? ` — ${formatBDT(l)} left to bill` : ' — nothing left to bill') : ` (${formatBDT(r.total)})`
                    return <option key={r.id} value={r.id}>{`Req ${formatReqNo(r.req_no)}${r.project_code ? ` · ${r.project_code}` : ''} · ${short(r.description)}${tail}`}</option>
                  })}
                </Select>
                {req && (
                  <p className="mt-1 text-xs text-gray-500">
                    Approved {formatBDT(req.total)}
                    {typeof req.billed === 'number' && <> · billed {formatBDT(req.billed)}</>}
                    {typeof left === 'number' && <> · <b className={left > 0.005 ? 'text-gray-800' : 'text-red-600'}>{formatBDT(left)} left to bill</b></>}
                  </p>
                )}
              </div>
            )
          )}
          {fixedRequisitionId && typeof left === 'number' && (
            <p className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700">
              Left to bill on this requisition: <b className={left > 0.005 ? 'text-gray-900' : 'text-red-600'}>{formatBDT(left)}</b>
            </p>
          )}

          {/* Supplier: type to search, or type a new name */}
          <div>
            <Input label="Supplier" required placeholder="Type the supplier name" autoComplete="off" className={TAP}
              value={supplierText} error={errors.supplier}
              onChange={(e) => { setSupplierText(e.target.value); setErrors((x) => ({ ...x, supplier: undefined })) }} />
            {exact && (
              <p className="mt-1 flex items-center gap-1 text-xs text-emerald-700"><Check size={13} /> Existing supplier</p>
            )}
            {!exact && matches.length > 0 && (
              <div className="mt-1.5 rounded-lg border border-amber-200 bg-amber-50 p-2">
                <p className="flex items-start gap-1.5 px-1 text-xs text-amber-900">
                  <AlertTriangle size={13} className="mt-0.5 flex-shrink-0" />
                  Is it one of these? Tap it — otherwise a new supplier &ldquo;{supplierText.trim()}&rdquo; will be added.
                </p>
                <ul className="mt-1.5 flex flex-wrap gap-1.5">
                  {matches.map((s) => (
                    <li key={s.id}>
                      <button type="button" onClick={() => { setSupplierText(s.name); setErrors((x) => ({ ...x, supplier: undefined })) }}
                        className={cn(TAP, 'inline-flex items-center rounded-full border border-amber-300 bg-white px-3 text-sm text-gray-800 hover:bg-amber-100')}>
                        {s.name}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {!exact && matches.length === 0 && typed && (
              <p className="mt-1 text-xs text-gray-500">New supplier — &ldquo;{supplierText.trim()}&rdquo; will be added.</p>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input label="Bill / challan no." value={billNo} onChange={(e) => setBillNo(e.target.value)} />
            <Input label="Bill date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>

          <div>
            <Input label="Bill total (Tk)" required type="number" step="any" inputMode="decimal" min={0} value={amount} error={errors.amount}
              onChange={(e) => { setAmount(e.target.value); setErrors((x) => ({ ...x, amount: undefined })) }} />
            {overBy > 0.005 && typeof left === 'number' && (
              <p className="mt-1.5 flex items-start gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                <AlertTriangle size={13} className="mt-0.5 flex-shrink-0" />
                <span>This is <b>{formatBDT(overBy)}</b> over the approved requisition ({formatBDT(Math.max(left, 0))} left to bill). You can still save it — the admin will be told.</span>
              </p>
            )}
          </div>

          <Input label="Note (optional)" placeholder="e.g. 10mm rod 3,500 kg" value={note} onChange={(e) => setNote(e.target.value)} />
          <PhotoInput value={photo} onChange={setPhoto} />
        </div>
      </Modal>
    </>
  )
}
