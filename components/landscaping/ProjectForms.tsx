'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { addClientReceipt, addVariation, saveProject } from '@/lib/actions/landscaping'
import { safeCall } from '@/lib/actions/safe-call'
import { toast } from '@/lib/toast'
import { TAP } from './ui'

const today = () => new Date().toISOString().slice(0, 10)
type Errs = Record<string, string | undefined>

/** Save / Cancel for the Modal footer, so they never scroll out of view. */
function FormFooter({ pending, onCancel, onSave, label = 'Save' }: { pending: boolean; onCancel: () => void; onSave: () => void; label?: string }) {
  return (
    <>
      <Button variant="outline" size="md" className={TAP} onClick={onCancel}>Cancel</Button>
      <Button variant="primary" size="md" className={TAP} loading={pending} onClick={onSave}>{label}</Button>
    </>
  )
}

export function ProjectForm({ clients, project, mains = [], parentId, label }: {
  clients: Array<{ id: string; name: string }>
  project?: { id: string; code: string; title: string; client_id: string | null; site: string | null; contract_value: number; start_date: string | null; end_date: string | null; status: string; notes: string | null; parent_id?: string | null }
  /** Main projects a sub-project can belong to. */
  mains?: Array<{ id: string; code: string; title: string }>
  /** Preset parent: "Add sub-project" on a project page. */
  parentId?: string
  label?: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()
  const [errs, setErrs] = useState<Errs>({})
  const [f, setF] = useState({
    code: project?.code ?? '', title: project?.title ?? '', client_id: project?.client_id ?? '', new_client: '',
    site: project?.site ?? '', contract_value: String(project?.contract_value ?? ''), start_date: project?.start_date ?? '',
    end_date: project?.end_date ?? '', status: project?.status ?? 'active', notes: project?.notes ?? '',
    parent_id: project?.parent_id ?? parentId ?? '',
  })
  const isSub = !!f.parent_id
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => { setF({ ...f, [k]: e.target.value }); if (errs[k]) setErrs({ ...errs, [k]: undefined }) }
  function save() {
    const e: Errs = {
      code: f.code.trim() ? undefined : 'Enter a short code, e.g. ASU',
      title: f.title.trim() ? undefined : 'Enter the project name',
      new_client: f.client_id === '__new' && !f.new_client.trim() ? 'Type the new client’s name' : undefined,
      end_date: f.start_date && f.end_date && f.end_date < f.start_date ? 'End is before the start' : undefined,
    }
    setErrs(e)
    if (Object.values(e).some(Boolean)) return
    start(async () => {
      const r = await safeCall(() => saveProject({
        id: project?.id, code: f.code, title: f.title, client_id: f.client_id === '__new' ? null : f.client_id || null,
        new_client: f.client_id === '__new' ? f.new_client : undefined, site: f.site, contract_value: Number(f.contract_value) || 0,
        start_date: f.start_date || null, end_date: f.end_date || null, status: f.status, notes: f.notes,
        parent_id: f.parent_id || null,
      }))
      if (!r.success) { toast.error(r.error); return }
      toast.success('Project saved'); setOpen(false)
      if (!project) router.push(`/landscaping/projects/${r.data.id}`)
      router.refresh()
    })
  }
  const close = () => { setOpen(false); setErrs({}) }
  return (
    <>
      <Button variant={project || label ? 'outline' : 'primary'} size="md" className={`${TAP} gap-1.5`} onClick={() => setOpen(true)}>{label ?? (project ? 'Edit project' : <><Plus size={14} /> New project</>)}</Button>
      <Modal open={open} onClose={close} title={project ? 'Edit project' : isSub ? 'New sub-project' : 'New project'}
        footer={<FormFooter pending={pending} onCancel={close} onSave={save} />}>
        <div className="space-y-3">
          {mains.length > 0 && !parentId && (
            <Select label="Part of" value={f.parent_id} onChange={set('parent_id')} className={TAP}>
              <option value="">— A main project (has its own client contract) —</option>
              {mains.filter((m) => m.id !== project?.id).map((m) => <option key={m.id} value={m.id}>Sub-project of {m.code} · {m.title}</option>)}
            </Select>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Input label="Code" required placeholder={isSub ? 'PARKING' : 'ASU'} value={f.code} onChange={set('code')} error={errs.code} />
            <div className="sm:col-span-2"><Input label="Title" required placeholder={isSub ? 'Parking area' : 'ASU landscaping & civil works'} value={f.title} onChange={set('title')} error={errs.title} /></div>
          </div>
          {!isSub && <>
            <Select label="Client" value={f.client_id} onChange={set('client_id')} className={TAP}>
              <option value="">— Choose —</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}<option value="__new">+ New client…</option>
            </Select>
            {f.client_id === '__new' && <Input label="New client name" value={f.new_client} onChange={set('new_client')} error={errs.new_client} />}
          </>}
          <Input label="Site / location" value={f.site} onChange={set('site')} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input label={isSub ? 'Budget (Tk)' : 'Contract value (Tk)'} type="number" step="any" inputMode="decimal" value={f.contract_value} onChange={set('contract_value')} />
            <Select label="Status" value={f.status} onChange={set('status')} className={TAP}>
              {[['quoted', 'Quoted'], ['active', 'Active'], ['on_hold', 'On hold'], ['completed', 'Completed'], ['cancelled', 'Cancelled']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Start" type="date" value={f.start_date} onChange={set('start_date')} />
            <Input label="End" type="date" value={f.end_date} onChange={set('end_date')} error={errs.end_date} />
          </div>
          <Input label="Notes" value={f.notes} onChange={set('notes')} />
        </div>
      </Modal>
    </>
  )
}

export function ClientReceiptForm({ projectId }: { projectId: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(today())
  const [method, setMethod] = useState<'cash' | 'bkash' | 'bank' | 'cheque'>('bank')
  const [reference, setReference] = useState('')
  const [err, setErr] = useState<string | undefined>()
  function save() {
    if (!(Number(amount) > 0)) { setErr('Enter the amount received'); return }
    start(async () => {
      const r = await safeCall(() => addClientReceipt({ project_id: projectId, amount: Number(amount), receipt_date: date, method, reference }))
      if (!r.success) { toast.error(r.error); return }
      toast.success('Client payment recorded'); setOpen(false); setAmount(''); setReference(''); router.refresh()
    })
  }
  const close = () => { setOpen(false); setErr(undefined) }
  return (
    <>
      <Button variant="outline" size="md" className={TAP} onClick={() => setOpen(true)}>Record client payment</Button>
      <Modal open={open} onClose={close} title="Money received from the client"
        footer={<FormFooter pending={pending} onCancel={close} onSave={save} />}>
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input label="Amount (Tk)" required type="number" step="any" inputMode="decimal" value={amount} error={err}
              onChange={(e) => { setAmount(e.target.value); setErr(undefined) }} />
            <Input label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <Select label="Received by" value={method} onChange={(e) => setMethod(e.target.value as typeof method)} className={TAP}
            options={[{ value: 'bank', label: 'Bank' }, { value: 'cheque', label: 'Cheque' }, { value: 'bkash', label: 'bKash' }, { value: 'cash', label: 'Cash' }]} />
          <Input label="Reference" placeholder="Cheque no. / TrxID" value={reference} onChange={(e) => setReference(e.target.value)} />
        </div>
      </Modal>
    </>
  )
}

export function VariationForm({ projectId }: { projectId: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(today())
  const [errs, setErrs] = useState<Errs>({})
  function save() {
    const e: Errs = {
      description: description.trim() ? undefined : 'Say what changed',
      amount: amount.trim() && Number(amount) !== 0 && !Number.isNaN(Number(amount)) ? undefined : 'Enter the amount (minus for less work)',
    }
    setErrs(e)
    if (e.description || e.amount) return
    start(async () => {
      const r = await safeCall(() => addVariation({ project_id: projectId, description, amount: Number(amount), var_date: date }))
      if (!r.success) { toast.error(r.error); return }
      toast.success('Contract change recorded'); setOpen(false); setDescription(''); setAmount(''); router.refresh()
    })
  }
  const close = () => { setOpen(false); setErrs({}) }
  return (
    <>
      <Button variant="outline" size="md" className={TAP} onClick={() => setOpen(true)}>Extra / reduced work</Button>
      <Modal open={open} onClose={close} title="Change to the contract"
        footer={<FormFooter pending={pending} onCancel={close} onSave={save} />}>
        <div className="space-y-3">
          <Input label="What changed" required placeholder="Extra futsal turf area" value={description} error={errs.description}
            onChange={(e) => { setDescription(e.target.value); setErrs({ ...errs, description: undefined }) }} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input label="Amount (Tk) — minus for less work" required type="number" step="any" value={amount} error={errs.amount}
              onChange={(e) => { setAmount(e.target.value); setErrs({ ...errs, amount: undefined }) }} />
            <Input label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>
      </Modal>
    </>
  )
}
