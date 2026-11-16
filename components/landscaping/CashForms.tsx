'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Banknote, HardHat } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { addExpense, recordCash } from '@/lib/actions/landscaping'
import { formatBDT } from '@/lib/formatters/currency'
import { safeCall } from '@/lib/actions/safe-call'
import { toast } from '@/lib/toast'
import { PhotoInput } from './PhotoInput'

const select = 'min-h-[42px] w-full rounded-lg border border-gray-300 bg-white px-3 text-sm focus:border-forest-600 focus:outline-none'
const today = () => new Date().toISOString().slice(0, 10)

/** Admin: cash handed to an accountant from the drawer, or handed back. */
export function GiveCashForm({ holders }: { holders: Array<{ user_id: string; name: string }> }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()
  const [holder, setHolder] = useState(holders[0]?.user_id ?? '')
  const [kind, setKind] = useState<'given' | 'returned'>('given')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(today())
  const [note, setNote] = useState('')
  function save() {
    start(async () => {
      const r = await safeCall(() => recordCash({ holder, kind, amount: Number(amount), mov_date: date, note }))
      if (!r.success) { toast.error(r.error); return }
      toast.success(kind === 'given' ? 'Cash handed over recorded' : 'Cash returned recorded'); setOpen(false); setAmount(''); setNote(''); router.refresh()
    })
  }
  return (
    <>
      <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setOpen(true)}><Banknote size={14} /> Give / take back cash</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Cash from the drawer">
        <div className="space-y-3">
          {holders.length === 0 && <p className="text-sm text-amber-700">Nobody is set to make payments yet — tick “Pay” for them in Team.</p>}
          <div className="grid grid-cols-2 gap-3">
            <div><label className="field-label">Accountant</label>
              <select className={select} value={holder} onChange={(e) => setHolder(e.target.value)}>{holders.map((h) => <option key={h.user_id} value={h.user_id}>{h.name}</option>)}</select></div>
            <div><label className="field-label">What happened</label>
              <select className={select} value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
                <option value="given">Given to them</option><option value="returned">Returned by them</option>
              </select></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Amount (Tk)" type="number" step="any" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
            <Input label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <Input label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="flex justify-end gap-2"><Button variant="outline" size="md" onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" size="md" loading={pending} onClick={save}>Save</Button></div>
        </div>
      </Modal>
    </>
  )
}

/** Daily labour, managers' food, transport, tools or other — paid from my cash or by bKash/bank. */
export function ExpenseForm({ projects }: { projects: Array<{ id: string; code: string; title: string; label?: string }> }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()
  const [category, setCategory] = useState<'labour' | 'food' | 'transport' | 'tools' | 'other'>('labour')
  const [projectId, setProjectId] = useState(projects.length === 1 ? projects[0].id : '')
  const [date, setDate] = useState(today())
  const [workers, setWorkers] = useState('')
  const [rate, setRate] = useState('')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [payee, setPayee] = useState('')
  const [method, setMethod] = useState<'cash' | 'bkash' | 'bank' | 'cheque'>('cash')
  const [photo, setPhoto] = useState<string | null>(null)
  const labourTotal = Number(workers) * Number(rate)

  function save() {
    start(async () => {
      const r = await safeCall(() => addExpense({
        project_id: projectId || null, exp_date: date, category, description, payee, method, photo_path: photo,
        workers: category === 'labour' && workers ? Number(workers) : null, rate: category === 'labour' && rate ? Number(rate) : null,
        amount: category === 'labour' && labourTotal > 0 ? labourTotal : Number(amount),
      }))
      if (!r.success) { toast.error(r.error); return }
      toast.success('Recorded'); setOpen(false); setWorkers(''); setRate(''); setAmount(''); setDescription(''); setPayee(''); setPhoto(null); router.refresh()
    })
  }
  return (
    <>
      <Button variant="primary" size="sm" className="gap-1.5" onClick={() => setOpen(true)}><HardHat size={14} /> Labour / food / other</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Record spending">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="field-label">What for</label>
              <select className={select} value={category} onChange={(e) => setCategory(e.target.value as typeof category)}>
                <option value="labour">Daily labour</option><option value="food">Food (managers / staff)</option>
                <option value="transport">Transport</option><option value="tools">Tools & small items</option><option value="other">Other</option>
              </select></div>
            <Input label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div><label className="field-label">Project</label>
            <select className={select} value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">— Business overhead (no project) —</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.label ?? p.code} · {p.title}</option>)}
            </select></div>
          {category === 'labour' ? (
            <div className="grid grid-cols-3 gap-3">
              <Input label="Workers" type="number" inputMode="numeric" value={workers} onChange={(e) => setWorkers(e.target.value)} />
              <Input label="Rate / day (Tk)" type="number" step="any" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} />
              <div><label className="field-label">Total</label><p className="flex min-h-[42px] items-center rounded-lg bg-gray-50 px-3 text-sm font-semibold">{formatBDT(labourTotal || 0)}</p></div>
            </div>
          ) : (
            <Input label="Amount (Tk)" type="number" step="any" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          )}
          <Input label="Details" placeholder={category === 'labour' ? 'Masons for parking dhalai' : category === 'food' ? 'Lunch for site managers' : ''} value={description} onChange={(e) => setDescription(e.target.value)} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Paid to (optional)" placeholder="Sardar / shop" value={payee} onChange={(e) => setPayee(e.target.value)} />
            <div><label className="field-label">Paid by</label>
              <select className={select} value={method} onChange={(e) => setMethod(e.target.value as typeof method)}>
                <option value="cash">Cash (from my cash in hand)</option><option value="bkash">bKash</option><option value="bank">Bank</option><option value="cheque">Cheque</option>
              </select></div>
          </div>
          <PhotoInput value={photo} onChange={setPhoto} label="Photo of the slip (optional)" />
          <div className="flex justify-end gap-2"><Button variant="outline" size="md" onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" size="md" loading={pending} onClick={save}>Save</Button></div>
        </div>
      </Modal>
    </>
  )
}
