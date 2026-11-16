'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { addClientReceipt, addVariation, saveProject } from '@/lib/actions/landscaping'
import { safeCall } from '@/lib/actions/safe-call'
import { toast } from '@/lib/toast'

const select = 'min-h-[42px] w-full rounded-lg border border-gray-300 bg-white px-3 text-sm focus:border-forest-600 focus:outline-none'
const today = () => new Date().toISOString().slice(0, 10)

export function ProjectForm({ clients, project }: {
  clients: Array<{ id: string; name: string }>
  project?: { id: string; code: string; title: string; client_id: string | null; site: string | null; contract_value: number; start_date: string | null; end_date: string | null; status: string; notes: string | null }
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()
  const [f, setF] = useState({
    code: project?.code ?? '', title: project?.title ?? '', client_id: project?.client_id ?? '', new_client: '',
    site: project?.site ?? '', contract_value: String(project?.contract_value ?? ''), start_date: project?.start_date ?? '',
    end_date: project?.end_date ?? '', status: project?.status ?? 'active', notes: project?.notes ?? '',
  })
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })
  function save() {
    start(async () => {
      const r = await safeCall(() => saveProject({
        id: project?.id, code: f.code, title: f.title, client_id: f.client_id === '__new' ? null : f.client_id || null,
        new_client: f.client_id === '__new' ? f.new_client : undefined, site: f.site, contract_value: Number(f.contract_value) || 0,
        start_date: f.start_date || null, end_date: f.end_date || null, status: f.status, notes: f.notes,
      }))
      if (!r.success) { toast.error(r.error); return }
      toast.success('Project saved'); setOpen(false)
      if (!project) router.push(`/landscaping/projects/${r.data.id}`)
      router.refresh()
    })
  }
  return (
    <>
      <Button variant={project ? 'outline' : 'primary'} size="sm" className="gap-1.5" onClick={() => setOpen(true)}>{project ? 'Edit project' : <><Plus size={14} /> New project</>}</Button>
      <Modal open={open} onClose={() => setOpen(false)} title={project ? 'Edit project' : 'New project'}>
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <Input label="Code" placeholder="ASU" value={f.code} onChange={set('code')} />
            <div className="col-span-2"><Input label="Title" placeholder="ASU landscaping & civil works" value={f.title} onChange={set('title')} /></div>
          </div>
          <div><label className="field-label">Client</label>
            <select className={select} value={f.client_id} onChange={set('client_id')}>
              <option value="">— Choose —</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}<option value="__new">+ New client…</option>
            </select></div>
          {f.client_id === '__new' && <Input label="New client name" value={f.new_client} onChange={set('new_client')} />}
          <Input label="Site / location" value={f.site} onChange={set('site')} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Contract value (Tk)" type="number" step="any" inputMode="decimal" value={f.contract_value} onChange={set('contract_value')} />
            <div><label className="field-label">Status</label>
              <select className={select} value={f.status} onChange={set('status')}>
                {['quoted', 'active', 'on_hold', 'completed', 'cancelled'].map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
              </select></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Start" type="date" value={f.start_date} onChange={set('start_date')} />
            <Input label="End" type="date" value={f.end_date} onChange={set('end_date')} />
          </div>
          <Input label="Notes" value={f.notes} onChange={set('notes')} />
          <div className="flex justify-end gap-2"><Button variant="outline" size="md" onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" size="md" loading={pending} onClick={save}>Save</Button></div>
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
  function save() {
    start(async () => {
      const r = await safeCall(() => addClientReceipt({ project_id: projectId, amount: Number(amount), receipt_date: date, method, reference }))
      if (!r.success) { toast.error(r.error); return }
      toast.success('Client payment recorded'); setOpen(false); setAmount(''); setReference(''); router.refresh()
    })
  }
  return (
    <>
      <Button variant="primary" size="sm" onClick={() => setOpen(true)}>Record client payment</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Money received from the client">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Input label="Amount (Tk)" type="number" step="any" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
            <Input label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div><label className="field-label">Received by</label>
            <select className={select} value={method} onChange={(e) => setMethod(e.target.value as typeof method)}>
              <option value="bank">Bank</option><option value="cheque">Cheque</option><option value="bkash">bKash</option><option value="cash">Cash</option>
            </select></div>
          <Input label="Reference" placeholder="Cheque no. / TrxID" value={reference} onChange={(e) => setReference(e.target.value)} />
          <div className="flex justify-end gap-2"><Button variant="outline" size="md" onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" size="md" loading={pending} onClick={save}>Save</Button></div>
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
  function save() {
    start(async () => {
      const r = await safeCall(() => addVariation({ project_id: projectId, description, amount: Number(amount), var_date: date }))
      if (!r.success) { toast.error(r.error); return }
      toast.success('Contract change recorded'); setOpen(false); setDescription(''); setAmount(''); router.refresh()
    })
  }
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>Extra / reduced work</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Change to the contract">
        <div className="space-y-3">
          <Input label="What changed" placeholder="Extra futsal turf area" value={description} onChange={(e) => setDescription(e.target.value)} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Amount (Tk) — minus for less work" type="number" step="any" value={amount} onChange={(e) => setAmount(e.target.value)} />
            <Input label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="flex justify-end gap-2"><Button variant="outline" size="md" onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" size="md" loading={pending} onClick={save}>Save</Button></div>
        </div>
      </Modal>
    </>
  )
}
