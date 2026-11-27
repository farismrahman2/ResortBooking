'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, RotateCcw, Send, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { saveRequisition, type RequisitionInput } from '@/lib/actions/landscaping'
import { lineAmount, requisitionTotal, formatReqNo } from '@/lib/landscaping/money'
import { formatBDT } from '@/lib/formatters/currency'
import { safeCall } from '@/lib/actions/safe-call'
import { toast } from '@/lib/toast'
import { CategoryPick, ItemDatalist, PersonPick, RateHint, findSuggestion, remember, type CategoryOpt, type ItemSuggestion, type PersonOpt } from './Picks'
import { StickyActions, TAP } from './ui'
import { MultiPhotoInput, joinPhotos } from './MultiPhotoInput'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { cn } from '@/lib/utils'

type Item = { description: string; qty: string; unit: string; unit_price: string }
type Pick = { personId: string; name: string }
const blank = (): Item => ({ description: '', qty: '', unit: '', unit_price: '' })
const UNITS = ['CFT', 'SFT', 'RFT', 'Gari', 'Bag', 'Kg', 'Ton', 'Pcs', 'Nos', 'Litre', 'Day', 'Job']
const DRAFT_KEY = 'ls.req.unsaved'

/** Landscaping form body: edge to edge on a phone (no card inside the page padding), a card on a computer. */
export const FORM_CARD = '-mx-4 space-y-4 border-y border-gray-200 bg-white p-4 sm:mx-auto sm:max-w-3xl sm:rounded-xl sm:border sm:p-5 sm:shadow-sm'

/**
 * The form's sticky save bar. Phone: the total and the smaller choices on one
 * line, the main button full width underneath (easy to reach). Computer: one row.
 */
export function FormActionBar({ summary, secondary, primary }: { summary?: React.ReactNode; secondary?: React.ReactNode; primary: React.ReactNode }) {
  return (
    <StickyActions>
      <div className="sm:!flex-1">
        <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
          <div className="mr-auto min-w-0 text-sm">{summary}</div>
          {secondary}
          <div className="w-full sm:w-auto [&>*]:w-full">{primary}</div>
        </div>
      </div>
    </StickyActions>
  )
}

/** New, sent-back or not-yet-checked requisition — the ASU Requisition Slip, typed on a phone. */
export function RequisitionForm({ initial, projects, nextNo, myName, people, categories, suggestions, initialProjectId, status, usedNos = [], slipPhotoPath = null, slipExtraPaths = [], canApprove = false }: {
  initial?: RequisitionInput & { id: string; req_no: number }
  projects: Array<{ id: string; code: string; title: string; label?: string }>
  nextNo: number
  myName: string
  people: PersonOpt[]
  categories: CategoryOpt[]
  suggestions: ItemSuggestion[]
  /** From "New requisition for this project". */
  initialProjectId?: string
  /** Current status when editing — a sent one stays in the queue for checking. */
  status?: string
  /** Numbers already taken (new requisitions only), to warn before saving. */
  usedNos?: Array<{ req_no: number; status: string }>
  /** Existing slip photo when editing. */
  slipPhotoPath?: string | null
  slipExtraPaths?: string[]
  /** Approver or admin: may approve this one themselves. */
  canApprove?: boolean
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const alreadySent = status === 'submitted' || status === 'checked'
  const isApproved = status === 'approved'
  const confirm = useConfirm()
  const [reqNo, setReqNo] = useState(String(initial?.req_no ?? nextNo))
  const [projectId, setProjectId] = useState(initial?.project_id ?? initialProjectId ?? (projects.length === 1 ? projects[0].id : ''))
  const [date, setDate] = useState(initial?.req_date ?? new Date().toISOString().slice(0, 10))
  const [categoryId, setCategoryId] = useState(initial?.category_id ?? '')
  const legacyDepartment = !initial?.category_id ? initial?.department ?? '' : ''
  const [description, setDescription] = useState(initial?.description ?? '')
  const [area, setArea] = useState(initial?.area_note ?? '')
  const [remarks, setRemarks] = useState(initial?.remarks ?? '')
  const [requester, setRequester] = useState<Pick>({
    personId: initial?.requested_by_person ?? '',
    name: initial && !initial.requested_by_person ? initial.requested_by_name ?? '' : '',
  })
  // Names printed on the slip's signature lines. Text, as on paper; picked from the people list.
  const asPick = (name?: string | null): Pick => {
    const hit = name ? people.find((p) => p.name.toLowerCase() === name.trim().toLowerCase()) : null
    return hit ? { personId: hit.id, name: '' } : { personId: '', name: name ?? '' }
  }
  const [slipPrepared, setSlipPrepared] = useState(asPick(initial?.slip_prepared_by))
  const [slipChecked, setSlipChecked] = useState(asPick(initial?.slip_checked_by))
  const [slipApproved, setSlipApproved] = useState(asPick(initial?.slip_approved_by))
  const nameOf = (v: Pick) => (v.personId ? people.find((p) => p.id === v.personId)?.name ?? '' : v.name.trim())
  const [items, setItems] = useState<Item[]>(
    initial?.items.map((i) => ({ description: i.description, qty: String(i.qty), unit: i.unit ?? '', unit_price: String(i.unit_price) })) ?? [blank()],
  )
  const [errors, setErrors] = useState<Record<string, string>>({})
  const startPhotos = joinPhotos(slipPhotoPath, slipExtraPaths)
  const [slipPhotos, setSlipPhotos] = useState<string[]>(startPhotos)
  const takenBy = !initial ? usedNos.find((u) => u.req_no === Number(reqNo)) : undefined
  const [restorable, setRestorable] = useState<Record<string, unknown> | null>(null)

  const parsed = useMemo(() => items.map((i) => ({ description: i.description, qty: Number(i.qty) || 0, unit: i.unit, unit_price: Number(i.unit_price) || 0 })), [items])
  const total = requisitionTotal(parsed.filter((i) => i.qty > 0))
  const set = (k: number, patch: Partial<Item>) => setItems((xs) => xs.map((x, i) => (i === k ? { ...x, ...patch } : x)))
  /** Typing a known item fills in its last unit and rate (only into empty boxes). */
  const setDescriptionAt = (k: number, value: string) => {
    const s = findSuggestion(suggestions, value)
    setItems((xs) => xs.map((x, i) => (i !== k ? x : {
      ...x, description: value,
      unit: x.unit || (s?.unit ?? ''), unit_price: x.unit_price || (s ? String(s.rate) : ''),
    })))
  }

  // ── A new slip is kept on this phone while typing, so Back or a refresh loses nothing.
  const snapshot = { projectId, date, categoryId, description, area, remarks, requester, items }
  const started = useRef(false)
  useEffect(() => {
    if (initial) return
    try {
      const saved = JSON.parse(window.localStorage.getItem(DRAFT_KEY) ?? 'null')
      if (saved && (saved.description || saved.items?.some((i: Item) => i.description))) setRestorable(saved)
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    if (initial) return
    if (!started.current) { started.current = true; return }
    const t = setTimeout(() => { try { window.localStorage.setItem(DRAFT_KEY, JSON.stringify(snapshot)) } catch { /* private mode */ } }, 400)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, date, categoryId, description, area, remarks, requester, items])
  function restore() {
    const s = restorable as typeof snapshot
    if (!s) return
    setProjectId(s.projectId ?? ''); setDate(s.date ?? date); setCategoryId(s.categoryId ?? ''); setDescription(s.description ?? '')
    setArea(s.area ?? ''); setRemarks(s.remarks ?? ''); if (s.requester) setRequester(s.requester); if (s.items?.length) setItems(s.items)
    setRestorable(null)
  }
  function discard() { try { window.localStorage.removeItem(DRAFT_KEY) } catch { /* ignore */ } setRestorable(null) }

  function validate() {
    const e: Record<string, string> = {}
    if (takenBy) e.reqNo = `Already used${takenBy.status === 'cancelled' ? ' (cancelled)' : ''} — try ${formatReqNo(nextNo)}`
    if (!projectId) e.project = 'Choose the project'
    if (!categoryId && !legacyDepartment) e.category = 'Choose the work category'
    if (!requester.personId && !requester.name.trim()) e.requester = 'Who asked for it?'
    if (!description.trim()) e.description = 'Say what it is for, e.g. “Septic tank wall”'
    const filled = items.filter((i) => i.description.trim())
    if (filled.length === 0) e.items = 'Add at least one item'
    items.forEach((i, k) => {
      if (!i.description.trim()) return
      if (!(Number(i.qty) > 0)) e[`qty${k}`] = 'Qty?'
      if (i.unit_price === '' || Number(i.unit_price) < 0) e[`rate${k}`] = 'Rate?'
    })
    setErrors(e)
    if (Object.keys(e).length) {
      toast.error('Please fix the boxes marked in red')
      document.querySelector('[data-err="1"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
    return Object.keys(e).length === 0
  }

  async function save(submit: boolean, selfApprove = false) {
    if (!validate()) return
    if (selfApprove) {
      const who = nameOf(slipApproved) || myName
      if (!(await confirm({ title: `Approve this requisition now as “${who}”?`, description: 'It skips checking, is marked Self-approved, and the admin sees it in the Audit Log. Change the “Approved by” name below if someone else approved it.', confirmLabel: 'Approve now' }))) return
    }
    start(async () => {
      const r = await safeCall(() => saveRequisition({
        id: initial?.id, req_no: Number(reqNo) || undefined, project_id: projectId || null, req_date: date,
        category_id: categoryId || null, department: legacyDepartment || null,
        requested_by_person: requester.personId || null, requested_by_name: requester.name,
        slip_prepared_by: nameOf(slipPrepared) || null, slip_checked_by: nameOf(slipChecked) || null, slip_approved_by: nameOf(slipApproved) || null,
        description, area_note: area, remarks, items: parsed.filter((i) => i.description.trim()), submit,
        slip_photo_paths: slipPhotos.join('|') !== startPhotos.join('|') ? slipPhotos : undefined,
        self_approve: selfApprove ? { approved_by_name: nameOf(slipApproved) || myName } : undefined,
      }))
      if (!r.success) { toast.error(r.error); return }
      remember('req.category', categoryId); remember('req.requester', requester.personId)
      remember('req.prepared', slipPrepared.personId); remember('req.checked', slipChecked.personId); remember('req.approved', slipApproved.personId)
      if (!initial) discard()
      toast.success(selfApprove ? 'Saved and approved' : isApproved ? 'Changes saved — still approved' : alreadySent ? 'Changes saved — still waiting for checking' : submit ? 'Sent for checking' : 'Saved as draft')
      router.push(`/landscaping/requisitions/${r.data.id}`)
      router.refresh()
    })
  }

  const err = (k: string) => errors[k]
  return (
    <div className={FORM_CARD}>
      {restorable && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <RotateCcw size={15} /> <span className="flex-1">You have an unsaved requisition on this phone.</span>
          <Button size="md" variant="primary" className={TAP} onClick={restore}>Restore it</Button>
          <Button size="md" variant="outline" className={TAP} onClick={discard}>Start fresh</Button>
        </div>
      )}
      {isApproved && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          This requisition is <b>approved</b>. Your changes keep it approved and are recorded in the Audit Log.
        </p>
      )}
      {alreadySent && (
        <p className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">
          This one is already sent. Your changes keep it in the queue{status === 'checked' ? ', and it will need checking again' : ' for checking'}.
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div data-err={takenBy ? 1 : undefined}>
          <Input label="Req. No." inputMode="numeric" value={reqNo} disabled={!!initial}
            error={takenBy ? `Already used${takenBy.status === 'cancelled' ? ' by a cancelled slip' : ''}` : undefined}
            hint={initial ? undefined : `Next free: ${formatReqNo(nextNo)}`}
            onChange={(e) => setReqNo(e.target.value.replace(/\D/g, ''))} />
          {takenBy && (
            <button type="button" className={`${TAP} px-1 text-sm font-medium text-forest-700 hover:underline`} onClick={() => setReqNo(String(nextNo))}>
              Use {formatReqNo(nextNo)}
            </button>
          )}
        </div>
        <Input label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <div className="col-span-2" data-err={err('project') ? 1 : undefined}>
          <Select label="Project" value={projectId} error={err('project')} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">— Choose project —</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.label ?? p.code} · {p.title}</option>)}
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div data-err={err('category') ? 1 : undefined}>
          <CategoryPick categories={categories} value={categoryId} onChange={setCategoryId} rememberKey="req.category" error={err('category')}
            label="Work category (Department / Section)" hint={legacyDepartment ? `Was typed as “${legacyDepartment}”` : 'Printed on the slip as the department'} />
        </div>
        <div data-err={err('requester') ? 1 : undefined}>
          <PersonPick label="Requested by" people={people} personId={requester.personId} name={requester.name} onChange={setRequester} error={err('requester')}
            rememberKey="req.requester" fallbackName={initial ? undefined : myName} />
        </div>
      </div>
      <div data-err={err('description') ? 1 : undefined}>
        <Input label="Description" placeholder="e.g. Septic tank wall" value={description} error={err('description')} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <Input label="Area / size (optional)" placeholder="Length 10 ft, Width 5 ft, Height 7 ft" value={area} onChange={(e) => setArea(e.target.value)} />

      <div data-err={err('items') ? 1 : undefined}>
        <h3 className="section-label mb-2">Items</h3>
        {err('items') && <p className="mb-2 text-xs text-red-600">{err('items')}</p>}
        <div className="space-y-2">
          {items.map((it, k) => (
            <div key={k} className="grid grid-cols-12 items-start gap-2 rounded-lg border border-gray-200 bg-gray-50 p-2.5">
              <div className="col-span-12 flex items-center gap-2 sm:hidden">
                <span className="text-xs font-semibold text-gray-500">Item {k + 1}</span>
                <span className="ml-auto text-sm font-semibold tabular-nums text-gray-800">{formatBDT(lineAmount(parsed[k]))}</span>
              </div>
              <div className="col-span-12 sm:col-span-5">
                <Input label={k === 0 ? 'Item' : undefined} aria-label="Item" list="ls-items" placeholder="Bricks, cement, sand…" value={it.description} onChange={(e) => setDescriptionAt(k, e.target.value)} />
              </div>
              {/* On phones every box shows its name, not just the first row. */}
              <div className="col-span-4 sm:col-span-2" data-err={err(`qty${k}`) ? 1 : undefined}>
                <Input label={k === 0 ? 'Qty' : undefined} aria-label="Qty" placeholder="Qty" type="number" step="any" inputMode="decimal" value={it.qty} error={err(`qty${k}`)} onChange={(e) => set(k, { qty: e.target.value })} />
              </div>
              <div className="col-span-4 sm:col-span-2">
                <Input label={k === 0 ? 'Unit' : undefined} aria-label="Unit" list="ls-units" placeholder="Unit" value={it.unit} onChange={(e) => set(k, { unit: e.target.value })} />
              </div>
              <div className="col-span-4 sm:col-span-2" data-err={err(`rate${k}`) ? 1 : undefined}>
                <Input label={k === 0 ? 'Rate (Tk)' : undefined} aria-label="Rate (Tk)" placeholder="Rate Tk" type="number" step="any" inputMode="decimal" value={it.unit_price} error={err(`rate${k}`)} onChange={(e) => set(k, { unit_price: e.target.value })} />
              </div>
              <div className={`col-span-12 flex justify-end sm:col-span-1 ${k === 0 ? 'sm:pt-6' : ''}`}>
                <button type="button" onClick={() => setItems((xs) => xs.length > 1 ? xs.filter((_, i) => i !== k) : [blank()])}
                  className="flex h-10 items-center gap-1 rounded-lg px-2 text-xs text-gray-500 hover:bg-white hover:text-red-600 sm:w-10 sm:justify-center sm:px-0" aria-label={`Remove item ${k + 1}`}>
                  <Trash2 size={16} /><span className="sm:hidden">Remove</span>
                </button>
              </div>
              <p className="col-span-12 -mt-1 hidden text-right text-xs tabular-nums text-gray-600 sm:block">= {formatBDT(lineAmount(parsed[k]))}</p>
              <RateHint list={suggestions} description={it.description} rate={it.unit_price} />
            </div>
          ))}
          <datalist id="ls-units">{UNITS.map((u) => <option key={u} value={u} />)}</datalist>
          <ItemDatalist list={suggestions} />
          <button type="button" onClick={() => setItems((xs) => [...xs, blank()])}
            className={`${TAP} inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-forest-400 bg-forest-50 px-4 text-sm font-medium text-forest-700 hover:bg-forest-100 sm:w-auto`}>
            <Plus size={15} /> Add another item
          </button>
        </div>
      </div>

      <Textarea label="Remarks / Notes" value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={2} />

      <div>
        <MultiPhotoInput value={slipPhotos} onChange={setSlipPhotos} label="Photos of the requisition slip (optional)" />
        <p className="mt-1 text-xs text-gray-500">Already signed on paper? Snap it here. Payment slips are added after approval, from the requisition page or Payment records.</p>
      </div>

      <div>
        <h3 className="section-label mb-1">Names on the slip</h3>
        <p className="mb-2 text-xs text-gray-500">Printed on the signature lines. The app still records who actually checks and approves it, and when.</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <PersonPick label="Prepared by" people={people} personId={slipPrepared.personId} name={slipPrepared.name} onChange={setSlipPrepared}
            rememberKey="req.prepared" fallbackName={initial ? undefined : myName} />
          <PersonPick label="Checked by" people={people} personId={slipChecked.personId} name={slipChecked.name} onChange={setSlipChecked}
            rememberKey="req.checked" />
          <PersonPick label="Approved by" people={people} personId={slipApproved.personId} name={slipApproved.name} onChange={setSlipApproved}
            rememberKey="req.approved" fallbackName={initial ? undefined : 'MD'} />
        </div>
      </div>

      <FormActionBar summary={<span className="font-semibold text-forest-900">Total <span className="tabular-nums">{formatBDT(total)}</span></span>}
        secondary={isApproved || alreadySent ? (
          alreadySent && canApprove ? <Button variant="outline" size="md" className={cn(TAP, 'px-3')} loading={pending} onClick={() => save(true, true)}><span className="sm:hidden">Approve now</span><span className="hidden sm:inline">Save &amp; approve now</span></Button> : null
        ) : (<>
          <Button variant="ghost" size="md" className={cn(TAP, 'px-3 text-forest-800')} loading={pending} onClick={() => save(false)}>Save draft</Button>
          {canApprove && <Button variant="outline" size="md" className={cn(TAP, 'px-3')} loading={pending} onClick={() => save(true, true)}><span className="sm:hidden">Approve now</span><span className="hidden sm:inline">Save &amp; approve now</span></Button>}
        </>)}
        primary={isApproved || alreadySent
          ? <Button variant="primary" size="md" className={TAP} loading={pending} onClick={() => save(true)}>Save changes</Button>
          : <Button variant="primary" size="md" className={TAP} loading={pending} onClick={() => save(true)}><Send size={15} /> Send for checking</Button>} />
    </div>
  )
}
