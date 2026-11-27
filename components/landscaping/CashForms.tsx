'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Banknote, HardHat } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { addExpense, recordCash } from '@/lib/actions/landscaping'
import { formatBDT } from '@/lib/formatters/currency'
import { safeCall } from '@/lib/actions/safe-call'
import { toast } from '@/lib/toast'
import { PhotoInput } from './PhotoInput'
import { recall, remember, type CategoryOpt } from './Picks'
import { TAP } from './ui'

/** Stored when the last entry was business overhead (remember() skips empty values). */
const OVERHEAD = '__overhead'
const today = () => new Date().toISOString().slice(0, 10)

function FormFooter({ pending, onCancel, onSave }: { pending: boolean; onCancel: () => void; onSave: () => void }) {
  return (
    <>
      <Button variant="outline" size="md" className={TAP} onClick={onCancel}>Cancel</Button>
      <Button variant="primary" size="md" className={TAP} loading={pending} onClick={onSave}>Save</Button>
    </>
  )
}

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
  const [errs, setErrs] = useState<{ holder?: string; amount?: string }>({})
  function save() {
    const e = { holder: holder ? undefined : 'Choose the accountant', amount: Number(amount) > 0 ? undefined : 'Enter the amount' }
    setErrs(e)
    if (e.holder || e.amount) return
    start(async () => {
      const r = await safeCall(() => recordCash({ holder, kind, amount: Number(amount), mov_date: date, note }))
      if (!r.success) { toast.error(r.error); return }
      toast.success(kind === 'given' ? 'Cash handed over recorded' : 'Cash returned recorded'); setOpen(false); setAmount(''); setNote(''); router.refresh()
    })
  }
  const close = () => { setOpen(false); setErrs({}) }
  return (
    <>
      <Button variant="outline" size="md" className={`${TAP} gap-1.5`} onClick={() => setOpen(true)}><Banknote size={14} /> Give cash<span className="hidden sm:inline"> / take back</span></Button>
      <Modal open={open} onClose={close} title="Cash from the drawer" footer={<FormFooter pending={pending} onCancel={close} onSave={save} />}>
        <div className="space-y-3">
          {holders.length === 0 && <p className="text-sm text-amber-700">Nobody is set to make payments yet — tick “Pay” for them in Team.</p>}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Select label="Accountant" value={holder} onChange={(e) => { setHolder(e.target.value); setErrs({ ...errs, holder: undefined }) }} className={TAP} error={errs.holder}>
              {holders.map((h) => <option key={h.user_id} value={h.user_id}>{h.name}</option>)}
            </Select>
            <Select label="What happened" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} className={TAP}
              options={[{ value: 'given', label: 'Given to them' }, { value: 'returned', label: 'Returned by them' }]} />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input label="Amount (Tk)" required type="number" step="any" inputMode="decimal" value={amount} error={errs.amount}
              onChange={(e) => { setAmount(e.target.value); setErrs({ ...errs, amount: undefined }) }} />
            <Input label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <Input label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      </Modal>
    </>
  )
}

/** Daily labour, managers' food, transport, tools or other — paid from my cash or by bKash/bank. */
export function ExpenseForm({ projects, categories = [] }: { projects: Array<{ id: string; code: string; title: string; label?: string }>; categories?: CategoryOpt[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()
  const [category, setCategory] = useState<'labour' | 'food' | 'transport' | 'tools' | 'other' | 'before_system'>('labour')
  const [projectId, setProjectId] = useState(projects.length === 1 ? projects[0].id : '')
  const [date, setDate] = useState(today())
  const [workers, setWorkers] = useState('')
  const [rate, setRate] = useState('')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [payee, setPayee] = useState('')
  const [method, setMethod] = useState<'cash' | 'cash_past' | 'bkash' | 'bank' | 'cheque'>('cash')
  const [photo, setPhoto] = useState<string | null>(null)
  const [workCategory, setWorkCategory] = useState('')
  const [errs, setErrs] = useState<{ amount?: string; workers?: string; rate?: string }>({})
  /** Labour, food and transport usually go under site running; a different category can still be picked. */
  const suggestFor = (c: typeof category) => {
    const want = c === 'tools' ? /^tools/i : ['labour', 'food', 'transport'].includes(c) ? /^site running/i : null
    return want ? categories.find((x) => want.test(x.name))?.id ?? '' : ''
  }
  const labourTotal = Number(workers) * Number(rate)

  function openForm() {
    setWorkCategory(recall(`exp.category.${category}`) ?? suggestFor(category))
    // The last project used on this phone, if it is still open.
    const last = recall('exp.project')
    if (last === OVERHEAD) setProjectId('')
    else if (last && projects.some((p) => p.id === last)) setProjectId(last)
    setErrs({})
    setOpen(true)
  }

  function save() {
    const e = category === 'labour'
      ? { workers: Number(workers) > 0 ? undefined : 'How many workers?', rate: Number(rate) > 0 ? undefined : 'Daily rate per worker' }
      : { amount: Number(amount) > 0 ? undefined : 'Enter the amount' }
    setErrs(e)
    if (Object.values(e).some(Boolean)) return
    start(async () => {
      const r = await safeCall(() => addExpense({
        project_id: projectId || null, exp_date: date, category, description, payee, photo_path: photo,
        // Spent before the system: never from anyone's current cash in hand.
        method: method === 'cash_past' ? 'cash' : method, from_float: method !== 'cash_past' && category !== 'before_system',
        workers: category === 'labour' && workers ? Number(workers) : null, rate: category === 'labour' && rate ? Number(rate) : null,
        amount: category === 'labour' && labourTotal > 0 ? labourTotal : Number(amount),
        work_category_id: workCategory || null,
      }))
      if (!r.success) { toast.error(r.error); return }
      remember(`exp.category.${category}`, workCategory)
      remember('exp.project', projectId || OVERHEAD)
      toast.success('Recorded'); setOpen(false); setWorkers(''); setRate(''); setAmount(''); setDescription(''); setPayee(''); setPhoto(null); router.refresh()
    })
  }
  const close = () => { setOpen(false); setErrs({}) }
  return (
    <>
      <Button variant="primary" size="md" className={`${TAP} gap-1.5`} onClick={openForm}>
        {/* Short on a phone (it sits in the page header), full on a computer. */}
        <HardHat size={14} /> <span className="sm:hidden">Spending</span><span className="hidden sm:inline">Labour / food / other</span>
      </Button>
      <Modal open={open} onClose={close} title="Record spending" footer={<FormFooter pending={pending} onCancel={close} onSave={save} />}>
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Select label="Type of spending" value={category} className={TAP} onChange={(e) => {
              const c = e.target.value as typeof category
              setCategory(c); setWorkCategory(recall(`exp.category.${c}`) ?? suggestFor(c)); setErrs({})
            }}>
              <option value="labour">Daily labour</option><option value="food">Food (managers / staff)</option>
              <option value="transport">Transport</option><option value="tools">Tools & small items</option><option value="other">Other</option>
              <option value="before_system">Spent before the system (one lump)</option>
            </Select>
            <Input label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <Select label="Project" value={projectId} onChange={(e) => setProjectId(e.target.value)} className={TAP}>
            <option value="">— Business overhead (no project) —</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.label ?? p.code} · {p.title}</option>)}
          </Select>
          {categories.length > 0 && (
            <Select label="Work category" value={workCategory} onChange={(e) => setWorkCategory(e.target.value)} className={TAP}
              hint="e.g. masons for paving → Hardscape & paving; tree planting labour → Trees & plants">
              <option value="">— Not set —</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          )}
          {category === 'labour' ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Input label="Workers" required type="number" inputMode="numeric" value={workers} error={errs.workers}
                onChange={(e) => { setWorkers(e.target.value); setErrs({ ...errs, workers: undefined }) }} />
              <Input label="Rate / day (Tk)" required type="number" step="any" inputMode="decimal" value={rate} error={errs.rate}
                onChange={(e) => { setRate(e.target.value); setErrs({ ...errs, rate: undefined }) }} />
              <div className="col-span-2 sm:col-span-1"><label className="field-label">Total</label><p className="flex min-h-[42px] items-center rounded-lg bg-gray-50 px-3 text-sm font-semibold tabular-nums">{formatBDT(labourTotal || 0)}</p></div>
            </div>
          ) : (
            <Input label="Amount (Tk)" required type="number" step="any" inputMode="decimal" value={amount} error={errs.amount}
              onChange={(e) => { setAmount(e.target.value); setErrs({ ...errs, amount: undefined }) }} />
          )}
          <Input label="Details" placeholder={category === 'labour' ? 'Masons for parking dhalai' : category === 'food' ? 'Lunch for site managers' : ''} value={description} onChange={(e) => setDescription(e.target.value)} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input label="Paid to (optional)" placeholder="Sardar / shop" value={payee} onChange={(e) => setPayee(e.target.value)} />
            <Select label="Paid by" value={method} onChange={(e) => setMethod(e.target.value as typeof method)} className={TAP}
              options={[
                { value: 'cash', label: 'Cash (from my cash in hand)' }, { value: 'cash_past', label: 'Cash — paid before the system' },
                { value: 'bkash', label: 'bKash' }, { value: 'bank', label: 'Bank' }, { value: 'cheque', label: 'Cheque' },
              ]} />
          </div>
          <PhotoInput value={photo} onChange={setPhoto} label="Photo of the slip (optional)" />
        </div>
      </Modal>
    </>
  )
}
