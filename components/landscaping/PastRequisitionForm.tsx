'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { recordPastRequisition } from '@/lib/actions/landscaping'
import { lineAmount, requisitionTotal } from '@/lib/landscaping/money'
import { formatBDT } from '@/lib/formatters/currency'
import { safeCall } from '@/lib/actions/safe-call'
import { toast } from '@/lib/toast'
import { PhotoInput } from './PhotoInput'
import { CategoryPick, ItemDatalist, PersonPick, RateHint, findSuggestion, remember, type CategoryOpt, type ItemSuggestion, type PersonOpt } from './Picks'

type Item = { description: string; qty: string; unit: string; unit_price: string }
type Bill = {
  supplier_id: string; new_supplier: string; bill_no: string; bill_date: string; amount: string; photo: string | null
  paid_amount: string; paid_date: string; paid_method: 'cash' | 'bkash' | 'bank' | 'cheque'; paid_reference: string
}
const blankItem = (): Item => ({ description: '', qty: '', unit: '', unit_price: '' })
const blankBill = (date: string): Bill => ({
  supplier_id: '', new_supplier: '', bill_no: '', bill_date: date, amount: '', photo: null,
  paid_amount: '', paid_date: date, paid_method: 'cash', paid_reference: '',
})
const select = 'min-h-[42px] w-full rounded-lg border border-gray-300 bg-white px-3 text-sm focus:border-forest-600 focus:outline-none'
const H = ({ children }: { children: React.ReactNode }) => <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">{children}</h3>

/** Admin: one paper slip — requisition, its bills and what was paid — typed in at once. */
export function PastRequisitionForm({ projects, suppliers, people, categories, suggestions }: {
  projects: Array<{ id: string; label: string; title: string }>
  suppliers: Array<{ id: string; name: string }>
  people: PersonOpt[]
  categories: CategoryOpt[]
  suggestions: ItemSuggestion[]
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [reqNo, setReqNo] = useState('')
  const [date, setDate] = useState('')
  const [projectId, setProjectId] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [description, setDescription] = useState('')
  const [area, setArea] = useState('')
  const [remarks, setRemarks] = useState('')
  const blank = { personId: '', name: '' }
  const [requester, setRequester] = useState(blank)
  const [prepared, setPrepared] = useState(blank)
  const [checked, setChecked] = useState(blank)
  const [approved, setApproved] = useState(blank)
  const nameOf = (v: { personId: string; name: string }) => (v.personId ? people.find((p) => p.id === v.personId)?.name ?? '' : v.name.trim())
  const [slipPhoto, setSlipPhoto] = useState<string | null>(null)
  const [items, setItems] = useState<Item[]>([blankItem()])
  const [bills, setBills] = useState<Bill[]>([])

  const parsed = useMemo(() => items.map((i) => ({ description: i.description, qty: Number(i.qty) || 0, unit: i.unit, unit_price: Number(i.unit_price) || 0 })), [items])
  const total = requisitionTotal(parsed.filter((i) => i.qty > 0))
  const billed = bills.reduce((s, b) => s + (Number(b.amount) || 0), 0)
  const paid = bills.reduce((s, b) => s + (Number(b.paid_amount) || 0), 0)
  const setItem = (k: number, p: Partial<Item>) => setItems((xs) => xs.map((x, i) => (i === k ? { ...x, ...p } : x)))
  const setItemName = (k: number, description: string) => {
    const s = findSuggestion(suggestions, description)
    setItems((xs) => xs.map((x, i) => (i !== k ? x : { ...x, description, unit: x.unit || (s?.unit ?? ''), unit_price: x.unit_price || (s ? String(s.rate) : '') })))
  }
  const setBill = (k: number, p: Partial<Bill>) => setBills((xs) => xs.map((x, i) => (i === k ? { ...x, ...p } : x)))

  function save(another: boolean) {
    if (!categoryId) { toast.error('Pick the work category'); return }
    start(async () => {
      const r = await safeCall(() => recordPastRequisition({
        req_no: Number(reqNo), project_id: projectId || null, req_date: date, category_id: categoryId, description, area_note: area, remarks,
        requested_by_person: requester.personId || null, requested_by_name: requester.name,
        paper_prepared_by: nameOf(prepared), paper_checked_by: nameOf(checked), paper_approved_by: nameOf(approved),
        slip_photo_path: slipPhoto, items: parsed,
        bills: bills.map((b) => ({
          supplier_id: b.supplier_id && b.supplier_id !== '__new' ? b.supplier_id : undefined,
          new_supplier: b.supplier_id === '__new' ? b.new_supplier : undefined,
          bill_no: b.bill_no, bill_date: b.bill_date || date, amount: Number(b.amount), photo_path: b.photo,
          paid_amount: Number(b.paid_amount) || 0, paid_date: b.paid_date || b.bill_date || date, paid_method: b.paid_method, paid_reference: b.paid_reference,
        })),
      }))
      if (!r.success) { toast.error(r.error); return }
      remember('past.category', categoryId); remember('past.requester', requester.personId)
      remember('past.prepared', prepared.personId); remember('past.checked', checked.personId); remember('past.approved', approved.personId)
      toast.success(`Req ${reqNo.padStart(5, '0')} entered from paper`)
      if (another) {
        // Keep the project, department and names — the next slip usually shares them.
        setReqNo(''); setDescription(''); setArea(''); setRemarks(''); setSlipPhoto(null); setItems([blankItem()]); setBills([])
        router.refresh()
      } else {
        router.push(`/landscaping/requisitions/${r.data.id}`)
      }
    })
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5 rounded-xl border border-gray-200 bg-white p-4 sm:p-5">
      <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
        For slips already signed on paper. It is saved as <b>approved</b>, marked “Entered from paper”, and logged.
        Cash paid back then is <b>not</b> taken from anyone’s current cash in hand.
      </p>

      <section>
        <H>The paper slip</H>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Input label="Req. No. (from the slip)" inputMode="numeric" placeholder="00026" value={reqNo} onChange={(e) => setReqNo(e.target.value.replace(/\D/g, ''))} />
          <Input label="Date on the slip" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <div className="col-span-2"><label className="field-label">Project</label>
            <select className={select} value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">— Choose project —</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.label} · {p.title}</option>)}
            </select></div>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <CategoryPick categories={categories} value={categoryId} onChange={setCategoryId} rememberKey="past.category" label="Work category (Department / Section)" />
          <PersonPick label="Requested by" people={people} personId={requester.personId} name={requester.name} onChange={setRequester} rememberKey="past.requester" placeholder="Liton" />
        </div>
        <div className="mt-3 space-y-3">
          <Input label="Description" placeholder="Materials requisition for parking area" value={description} onChange={(e) => setDescription(e.target.value)} />
          <Input label="Area / size (optional)" value={area} onChange={(e) => setArea(e.target.value)} />
        </div>
      </section>

      <section>
        <H>Items</H>
        <div className="space-y-2">
          {items.map((it, k) => (
            <div key={k} className="grid grid-cols-12 items-end gap-2 rounded-lg border border-gray-200 bg-gray-50 p-2">
              <div className="col-span-12 sm:col-span-5"><Input label={k === 0 ? 'Item' : undefined} list="ls-items" value={it.description} onChange={(e) => setItemName(k, e.target.value)} /></div>
              <div className="col-span-4 sm:col-span-2"><Input label={k === 0 ? 'Qty' : undefined} type="number" step="any" inputMode="decimal" value={it.qty} onChange={(e) => setItem(k, { qty: e.target.value })} /></div>
              <div className="col-span-4 sm:col-span-2"><Input label={k === 0 ? 'Unit' : undefined} list="ls-units" value={it.unit} onChange={(e) => setItem(k, { unit: e.target.value })} /></div>
              <div className="col-span-4 sm:col-span-2"><Input label={k === 0 ? 'Rate (Tk)' : undefined} type="number" step="any" inputMode="decimal" value={it.unit_price} onChange={(e) => setItem(k, { unit_price: e.target.value })} /></div>
              <div className="col-span-12 flex items-center justify-between sm:col-span-1 sm:justify-end">
                <span className="text-xs font-semibold tabular-nums sm:hidden">{formatBDT(lineAmount(parsed[k]))}</span>
                <button type="button" onClick={() => setItems((xs) => (xs.length > 1 ? xs.filter((_, i) => i !== k) : [blankItem()]))} className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-400 hover:text-red-600" aria-label="Remove item"><Trash2 size={15} /></button>
              </div>
              <RateHint list={suggestions} description={it.description} rate={it.unit_price} />
            </div>
          ))}
          <datalist id="ls-units">{['CFT', 'SFT', 'RFT', 'Gari', 'Bag', 'Kg', 'Ton', 'Pcs', 'Nos', 'Day', 'Job'].map((u) => <option key={u} value={u} />)}</datalist>
          <ItemDatalist list={suggestions} />
          <button type="button" onClick={() => setItems((xs) => [...xs, blankItem()])} className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-forest-400 bg-forest-50 px-3 py-1.5 text-xs font-medium text-forest-700"><Plus size={12} /> Add item</button>
        </div>
        <div className="mt-3 flex items-center justify-between rounded-lg bg-forest-50 px-4 py-3">
          <span className="text-sm font-semibold text-forest-900">Total amount</span><span className="text-lg font-bold tabular-nums text-forest-900">{formatBDT(total)}</span>
        </div>
        <div className="mt-3"><Input label="Remarks / Notes" value={remarks} onChange={(e) => setRemarks(e.target.value)} /></div>
      </section>

      <section>
        <H>Signed on paper by</H>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <PersonPick label="Prepared by" people={people} personId={prepared.personId} name={prepared.name} onChange={setPrepared} rememberKey="past.prepared" placeholder="Rifat" />
          <PersonPick label="Checked by" people={people} personId={checked.personId} name={checked.name} onChange={setChecked} rememberKey="past.checked" placeholder="Faris" />
          <PersonPick label="Approved by" people={people} personId={approved.personId} name={approved.name} onChange={setApproved} rememberKey="past.approved" fallbackName="MD" />
        </div>
        <div className="mt-3"><PhotoInput value={slipPhoto} onChange={setSlipPhoto} label="Photo of the signed slip (optional)" /></div>
      </section>

      <section>
        <H>Bills against it {bills.length > 0 && <span className="normal-case tracking-normal text-gray-500">— billed {formatBDT(billed)} · paid {formatBDT(paid)}</span>}</H>
        <div className="space-y-3">
          {bills.map((b, k) => (
            <div key={k} className="space-y-3 rounded-lg border border-gray-200 p-3">
              <div className="flex items-center"><span className="text-sm font-semibold text-gray-800">Bill {k + 1}</span>
                <button type="button" onClick={() => setBills((xs) => xs.filter((_, i) => i !== k))} className="ml-auto text-gray-400 hover:text-red-600" aria-label="Remove bill"><Trash2 size={15} /></button></div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div><label className="field-label">Supplier</label>
                  <select className={select} value={b.supplier_id} onChange={(e) => setBill(k, { supplier_id: e.target.value })}>
                    <option value="">— Choose —</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}<option value="__new">+ New supplier…</option>
                  </select></div>
                {b.supplier_id === '__new' && <Input label="New supplier name" placeholder="Mubin Traders" value={b.new_supplier} onChange={(e) => setBill(k, { new_supplier: e.target.value })} />}
              </div>
              <div className="grid grid-cols-3 gap-3">
                <Input label="Bill / challan no." value={b.bill_no} onChange={(e) => setBill(k, { bill_no: e.target.value })} />
                <Input label="Bill date" type="date" value={b.bill_date} onChange={(e) => setBill(k, { bill_date: e.target.value })} />
                <Input label="Bill total (Tk)" type="number" step="any" inputMode="decimal" value={b.amount} onChange={(e) => setBill(k, { amount: e.target.value })} />
              </div>
              <PhotoInput value={b.photo} onChange={(photo) => setBill(k, { photo })} />
              <div className="rounded-lg bg-gray-50 p-3">
                <p className="mb-2 text-xs text-gray-600">Paid already? Leave blank if still unpaid.</p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Input label="Paid (Tk)" type="number" step="any" inputMode="decimal" value={b.paid_amount} onChange={(e) => setBill(k, { paid_amount: e.target.value })} />
                  <Input label="Paid on" type="date" value={b.paid_date} onChange={(e) => setBill(k, { paid_date: e.target.value })} />
                  <div><label className="field-label">How</label>
                    <select className={select} value={b.paid_method} onChange={(e) => setBill(k, { paid_method: e.target.value as Bill['paid_method'] })}>
                      <option value="cash">Cash</option><option value="bkash">bKash</option><option value="bank">Bank</option><option value="cheque">Cheque</option>
                    </select></div>
                  <Input label="Reference" value={b.paid_reference} onChange={(e) => setBill(k, { paid_reference: e.target.value })} />
                </div>
                <button type="button" className="mt-2 text-xs font-medium text-forest-700 hover:underline" onClick={() => setBill(k, { paid_amount: b.amount, paid_date: b.paid_date || b.bill_date })}>Paid in full</button>
              </div>
            </div>
          ))}
          <button type="button" onClick={() => setBills((xs) => [...xs, blankBill(date)])} className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-forest-400 bg-forest-50 px-3 py-1.5 text-xs font-medium text-forest-700"><Plus size={12} /> Add a bill</button>
        </div>
      </section>

      <div className="flex flex-wrap justify-end gap-2 border-t border-gray-100 pt-4">
        <Button variant="outline" size="md" loading={pending} onClick={() => save(true)}>Save & enter the next slip</Button>
        <Button variant="primary" size="md" loading={pending} onClick={() => save(false)}>Save</Button>
      </div>
    </div>
  )
}
