'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { savePerson, saveWorkCategory } from '@/lib/actions/landscaping'
import { safeCall } from '@/lib/actions/safe-call'
import { toast } from '@/lib/toast'
import type { LsCategory, LsPerson } from '@/lib/queries/landscaping'
import type { ActionData } from '@/lib/actions/types'

const Card = ({ title, note, children }: { title: string; note: string; children: React.ReactNode }) => (
  <div className="rounded-xl border border-gray-200 bg-white">
    <div className="border-b border-gray-100 px-4 py-3"><h3 className="text-sm font-semibold">{title}</h3><p className="text-xs text-gray-500">{note}</p></div>
    {children}
  </div>
)

/** Admin: the people list and the work categories used across Landscaping forms. */
export function PeopleList({ people, editable }: { people: LsPerson[]; editable: boolean }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [name, setName] = useState('')
  const [designation, setDesignation] = useState('')
  const [phone, setPhone] = useState('')
  const run = (fn: () => Promise<ActionData<{ id: string }>>, ok: string, after?: () => void) => start(async () => {
    const r = await safeCall(fn)
    if (!r.success) { toast.error(r.error); return }
    toast.success(ok); after?.(); router.refresh()
  })
  return (
    <Card title="People involved" note="Names to pick for Requested by and the paper signatures (site managers, sardars, MD…). They don't need a login.">
      <ul className="divide-y divide-gray-100">
        {people.length === 0 && <li className="px-4 py-3 text-sm text-gray-500">Nobody yet — add the usual names below.</li>}
        {people.map((p) => (
          <li key={p.id} className={`flex flex-wrap items-center gap-x-3 px-4 py-2 text-sm ${p.is_active ? '' : 'text-gray-400'}`}>
            <span className="font-medium">{p.name}</span>
            {p.designation && <span className="text-xs text-gray-500">{p.designation}</span>}
            {p.phone && <span className="text-xs text-gray-500">{p.phone}</span>}
            {editable && (
              <button type="button" disabled={pending} className="ml-auto text-xs text-forest-700 hover:underline"
                onClick={() => run(() => savePerson({ id: p.id, name: p.name, designation: p.designation ?? '', phone: p.phone ?? '', is_active: !p.is_active }), p.is_active ? 'Hidden from the lists' : 'Back on the lists')}>
                {p.is_active ? 'Hide' : 'Show again'}
              </button>
            )}
          </li>
        ))}
      </ul>
      {editable && (
        <div className="grid grid-cols-1 items-end gap-2 border-t border-gray-100 p-3 sm:grid-cols-4">
          <Input label="Name" placeholder="Liton" value={name} onChange={(e) => setName(e.target.value)} />
          <Input label="Designation" placeholder="Site manager" value={designation} onChange={(e) => setDesignation(e.target.value)} />
          <Input label="Phone (optional)" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <Button variant="primary" size="md" className="gap-1.5" loading={pending}
            onClick={() => run(() => savePerson({ name, designation, phone }), `${name} added`, () => { setName(''); setDesignation(''); setPhone('') })}>
            <Plus size={14} /> Add person
          </Button>
        </div>
      )}
    </Card>
  )
}

export function CategoryList({ categories, editable }: { categories: LsCategory[]; editable: boolean }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [name, setName] = useState('')
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null)
  const run = (fn: () => Promise<ActionData<{ id: string }>>, ok: string, after?: () => void) => start(async () => {
    const r = await safeCall(fn)
    if (!r.success) { toast.error(r.error); return }
    toast.success(ok); after?.(); router.refresh()
  })
  return (
    <Card title="Work categories" note="What the money was for. Every requisition and labour/food entry gets one, so Reports can show spending by category for each project.">
      <ul className="divide-y divide-gray-100">
        {categories.map((c) => (
          <li key={c.id} className={`flex flex-wrap items-center gap-2 px-4 py-2 text-sm ${c.is_active ? '' : 'text-gray-400 line-through'}`}>
            {editing?.id === c.id ? (
              <>
                <div className="min-w-0 flex-1"><Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></div>
                <Button size="sm" variant="primary" loading={pending} onClick={() => run(() => saveWorkCategory({ id: c.id, name: editing.name, sort_order: c.sort_order, is_active: c.is_active }), 'Renamed', () => setEditing(null))}>Save</Button>
                <Button size="sm" variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
              </>
            ) : (
              <>
                <span>{c.name}</span>
                {editable && (
                  <span className="ml-auto flex gap-3 text-xs">
                    <button type="button" className="text-forest-700 hover:underline" onClick={() => setEditing({ id: c.id, name: c.name })}>Rename</button>
                    <button type="button" disabled={pending} className="text-forest-700 hover:underline"
                      onClick={() => run(() => saveWorkCategory({ id: c.id, name: c.name, sort_order: c.sort_order, is_active: !c.is_active }), c.is_active ? 'Hidden (kept on old records)' : 'Back on the list')}>
                      {c.is_active ? 'Hide' : 'Show again'}
                    </button>
                  </span>
                )}
              </>
            )}
          </li>
        ))}
      </ul>
      {editable && (
        <div className="flex items-end gap-2 border-t border-gray-100 p-3">
          <div className="flex-1"><Input label="New category" placeholder="Water features" value={name} onChange={(e) => setName(e.target.value)} /></div>
          <Button variant="primary" size="md" className="gap-1.5" loading={pending}
            onClick={() => run(() => saveWorkCategory({ name, sort_order: (categories.at(-1)?.sort_order ?? 100) + 5 }), `${name} added`, () => setName(''))}>
            <Plus size={14} /> Add
          </Button>
        </div>
      )}
    </Card>
  )
}
