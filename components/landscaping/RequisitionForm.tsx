'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { saveRequisition, type RequisitionInput } from '@/lib/actions/landscaping'
import { lineAmount, requisitionTotal, formatReqNo } from '@/lib/landscaping/money'
import { formatBDT } from '@/lib/formatters/currency'
import { safeCall } from '@/lib/actions/safe-call'
import { toast } from '@/lib/toast'

type Item = { description: string; qty: string; unit: string; unit_price: string }
const blank = (): Item => ({ description: '', qty: '', unit: '', unit_price: '' })
const UNITS = ['CFT', 'SFT', 'RFT', 'Gari', 'Bag', 'Kg', 'Ton', 'Pcs', 'Nos', 'Litre', 'Day', 'Job']

/** New or sent-back requisition — the ASU Requisition Slip, typed on a phone. */
export function RequisitionForm({ initial, projects, nextNo, myName }: {
  initial?: RequisitionInput & { id: string; req_no: number }
  projects: Array<{ id: string; code: string; title: string }>
  nextNo: number
  myName: string
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [reqNo, setReqNo] = useState(String(initial?.req_no ?? nextNo))
  const [projectId, setProjectId] = useState(initial?.project_id ?? (projects.length === 1 ? projects[0].id : ''))
  const [date, setDate] = useState(initial?.req_date ?? new Date().toISOString().slice(0, 10))
  const [department, setDepartment] = useState(initial?.department ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [area, setArea] = useState(initial?.area_note ?? '')
  const [remarks, setRemarks] = useState(initial?.remarks ?? '')
  const [requestedBy, setRequestedBy] = useState(initial?.requested_by_name ?? myName)
  const [items, setItems] = useState<Item[]>(
    initial?.items.map((i) => ({ description: i.description, qty: String(i.qty), unit: i.unit ?? '', unit_price: String(i.unit_price) })) ?? [blank()],
  )

  const parsed = useMemo(() => items.map((i) => ({ description: i.description, qty: Number(i.qty) || 0, unit: i.unit, unit_price: Number(i.unit_price) || 0 })), [items])
  const total = requisitionTotal(parsed.filter((i) => i.qty > 0))
  const set = (k: number, patch: Partial<Item>) => setItems((xs) => xs.map((x, i) => (i === k ? { ...x, ...patch } : x)))

  function save(submit: boolean) {
    start(async () => {
      const r = await safeCall(() => saveRequisition({
        id: initial?.id, req_no: Number(reqNo) || undefined, project_id: projectId || null, req_date: date,
        department, description, area_note: area, remarks, requested_by_name: requestedBy, items: parsed, submit,
      }))
      if (!r.success) { toast.error(r.error); return }
      toast.success(submit ? 'Sent for checking' : 'Saved as draft')
      router.push(`/landscaping/requisitions/${r.data.id}`)
      router.refresh()
    })
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 rounded-xl border border-gray-200 bg-white p-4 sm:p-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Input label="Req. No." inputMode="numeric" value={reqNo} disabled={!!initial} hint={initial ? undefined : `Next free: ${formatReqNo(nextNo)}`}
          onChange={(e) => setReqNo(e.target.value.replace(/\D/g, ''))} />
        <Input label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <div className="col-span-2">
          <label className="field-label">Project</label>
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)}
            className="min-h-[42px] w-full rounded-lg border border-gray-300 bg-white px-3 text-sm focus:border-forest-600 focus:outline-none">
            <option value="">— Choose project —</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.title}</option>)}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Input label="Department / Section" placeholder="Civil Works" value={department} onChange={(e) => setDepartment(e.target.value)} />
        <Input label="Requested by" value={requestedBy} onChange={(e) => setRequestedBy(e.target.value)} />
      </div>
      <Input label="Description" placeholder="Materials requisition for parking area" value={description} onChange={(e) => setDescription(e.target.value)} />
      <Input label="Area / size (optional)" placeholder="Parking Area – 5,670 SFT · Ramp – 825 SFT" value={area} onChange={(e) => setArea(e.target.value)} />

      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Items</h3>
        <div className="space-y-2">
          {items.map((it, k) => (
            <div key={k} className="grid grid-cols-12 items-end gap-2 rounded-lg border border-gray-200 bg-gray-50 p-2">
              <div className="col-span-12 sm:col-span-5">
                <Input label={k === 0 ? 'Item' : undefined} placeholder="Brick chips" value={it.description} onChange={(e) => set(k, { description: e.target.value })} />
              </div>
              <div className="col-span-4 sm:col-span-2">
                <Input label={k === 0 ? 'Qty' : undefined} type="number" step="any" inputMode="decimal" value={it.qty} onChange={(e) => set(k, { qty: e.target.value })} />
              </div>
              <div className="col-span-4 sm:col-span-2">
                <Input label={k === 0 ? 'Unit' : undefined} list="ls-units" placeholder="CFT" value={it.unit} onChange={(e) => set(k, { unit: e.target.value })} />
              </div>
              <div className="col-span-4 sm:col-span-2">
                <Input label={k === 0 ? 'Rate (Tk)' : undefined} type="number" step="any" inputMode="decimal" value={it.unit_price} onChange={(e) => set(k, { unit_price: e.target.value })} />
              </div>
              <div className="col-span-12 flex items-center justify-between sm:col-span-1 sm:justify-end">
                <span className="text-xs font-semibold tabular-nums text-gray-700 sm:hidden">{formatBDT(lineAmount(parsed[k]))}</span>
                <button type="button" onClick={() => setItems((xs) => xs.length > 1 ? xs.filter((_, i) => i !== k) : [blank()])}
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-400 hover:bg-white hover:text-red-600" aria-label="Remove item">
                  <Trash2 size={15} />
                </button>
              </div>
              <p className="col-span-12 hidden text-right text-xs tabular-nums text-gray-600 sm:block">= {formatBDT(lineAmount(parsed[k]))}</p>
            </div>
          ))}
          <datalist id="ls-units">{UNITS.map((u) => <option key={u} value={u} />)}</datalist>
          <button type="button" onClick={() => setItems((xs) => [...xs, blank()])}
            className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-forest-400 bg-forest-50 px-3 py-1.5 text-xs font-medium text-forest-700">
            <Plus size={12} /> Add item
          </button>
        </div>
        <div className="mt-3 flex items-center justify-between rounded-lg bg-forest-50 px-4 py-3">
          <span className="text-sm font-semibold text-forest-900">Total amount</span>
          <span className="text-lg font-bold tabular-nums text-forest-900">{formatBDT(total)}</span>
        </div>
      </div>

      <Textarea label="Remarks / Notes" value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={2} />
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" size="md" loading={pending} onClick={() => save(false)}>Save draft</Button>
        <Button variant="primary" size="md" loading={pending} onClick={() => save(true)}>Send for checking</Button>
      </div>
    </div>
  )
}
