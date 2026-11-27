'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { savePerson, saveWorkCategory } from '@/lib/actions/landscaping'
import { safeCall } from '@/lib/actions/safe-call'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/utils'
import type { LsCategory, LsPerson } from '@/lib/queries/landscaping'
import type { ActionData } from '@/lib/actions/types'
import { LsEmpty, LsSection, TAP } from './ui'

const Note = ({ children }: { children: React.ReactNode }) => <p className="border-b border-gray-100 px-4 py-2 text-xs text-gray-500">{children}</p>

/** Admin: the people list and the work categories used across Landscaping forms. */
export function PeopleList({ people, editable }: { people: LsPerson[]; editable: boolean }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [name, setName] = useState('')
  const [designation, setDesignation] = useState('')
  const [phone, setPhone] = useState('')
  const [err, setErr] = useState<string | undefined>()
  const run = (fn: () => Promise<ActionData<{ id: string }>>, ok: string, after?: () => void) => start(async () => {
    const r = await safeCall(fn)
    if (!r.success) { toast.error(r.error); return }
    toast.success(ok); after?.(); router.refresh()
  })
  function add() {
    if (!name.trim()) { setErr('Type the person’s name'); return }
    run(() => savePerson({ name: name.trim(), designation, phone }), `${name.trim()} added`, () => { setName(''); setDesignation(''); setPhone('') })
  }
  return (
    <LsSection title="People involved">
      <Note>Names to pick for Requested by and the paper signatures (site managers, sardars, MD…). They don&apos;t need a login.</Note>
      {people.length === 0 ? <LsEmpty title="Nobody yet" hint={editable ? 'Add the usual names below.' : undefined} /> : (
        <ul className="divide-y divide-gray-100">
          {people.map((p) => (
            <li key={p.id} className={cn('flex items-center gap-3 px-4 py-2 text-sm', !p.is_active && 'text-gray-400')}>
              <div className="min-w-0 flex-1">
                <p className="font-medium">{p.name}{!p.is_active && <span className="ml-1 text-xs font-normal">(hidden)</span>}</p>
                {(p.designation || p.phone) && <p className="text-xs text-gray-500">{[p.designation, p.phone].filter(Boolean).join(' · ')}</p>}
              </div>
              {editable && (
                <Button variant="outline" size="md" className={cn(TAP, 'flex-shrink-0')} disabled={pending}
                  onClick={() => run(() => savePerson({ id: p.id, name: p.name, designation: p.designation ?? '', phone: p.phone ?? '', is_active: !p.is_active }), p.is_active ? 'Hidden from the lists' : 'Back on the lists')}>
                  {p.is_active ? 'Hide' : 'Show again'}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {editable && (
        <div className="space-y-2 border-t border-gray-100 p-3">
          <div className="grid grid-cols-1 items-start gap-2 sm:grid-cols-3">
            <Input label="Name" required placeholder="Liton" value={name} error={err} onChange={(e) => { setName(e.target.value); setErr(undefined) }} />
            <Input label="Designation" placeholder="Site manager" value={designation} onChange={(e) => setDesignation(e.target.value)} />
            <Input label="Phone (optional)" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div className="flex justify-end">
            <Button variant="primary" size="md" className={cn(TAP, 'w-full gap-1.5 sm:w-auto')} loading={pending} onClick={add}>
              <Plus size={14} /> Add person
            </Button>
          </div>
        </div>
      )}
    </LsSection>
  )
}

export function CategoryList({ categories, editable }: { categories: LsCategory[]; editable: boolean }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [name, setName] = useState('')
  const [err, setErr] = useState<string | undefined>()
  const [editing, setEditing] = useState<{ id: string; name: string; err?: string } | null>(null)
  const run = (fn: () => Promise<ActionData<{ id: string }>>, ok: string, after?: () => void) => start(async () => {
    const r = await safeCall(fn)
    if (!r.success) { toast.error(r.error); return }
    toast.success(ok); after?.(); router.refresh()
  })
  function add() {
    if (!name.trim()) { setErr('Type a category name'); return }
    run(() => saveWorkCategory({ name: name.trim(), sort_order: (categories.at(-1)?.sort_order ?? 100) + 5 }), `${name.trim()} added`, () => setName(''))
  }
  function rename(c: LsCategory) {
    if (!editing) return
    if (!editing.name.trim()) { setEditing({ ...editing, err: 'The name can’t be blank' }); return }
    run(() => saveWorkCategory({ id: c.id, name: editing.name.trim(), sort_order: c.sort_order, is_active: c.is_active }), 'Renamed', () => setEditing(null))
  }
  return (
    <LsSection title="Work categories">
      <Note>What the money was for. Every requisition and labour / food / other entry gets one, so Reports can show spending by category for each project.</Note>
      {categories.length === 0 ? <LsEmpty title="No categories yet" hint={editable ? 'Add one below.' : undefined} /> : (
        <ul className="divide-y divide-gray-100">
          {categories.map((c) => (
            <li key={c.id} className="px-4 py-2 text-sm">
              {editing?.id === c.id ? (
                <div className="flex flex-wrap items-start gap-2">
                  <div className="min-w-[10rem] flex-1">
                    <Input aria-label="Category name" value={editing.name} error={editing.err} autoFocus
                      onChange={(e) => setEditing({ ...editing, name: e.target.value, err: undefined })}
                      onKeyDown={(e) => { if (e.key === 'Enter') rename(c); if (e.key === 'Escape') setEditing(null) }} />
                  </div>
                  <Button size="md" variant="primary" className={TAP} loading={pending} onClick={() => rename(c)}>Save</Button>
                  <Button size="md" variant="outline" className={TAP} onClick={() => setEditing(null)}>Cancel</Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className={cn('min-w-0 flex-1', !c.is_active && 'text-gray-400 line-through')}>{c.name}</span>
                  {editable && (
                    <>
                      <Button size="md" variant="ghost" className={cn(TAP, 'flex-shrink-0 px-3 text-forest-700')} onClick={() => setEditing({ id: c.id, name: c.name })}>Rename</Button>
                      <Button size="md" variant="outline" className={cn(TAP, 'flex-shrink-0 px-3')} disabled={pending}
                        onClick={() => run(() => saveWorkCategory({ id: c.id, name: c.name, sort_order: c.sort_order, is_active: !c.is_active }), c.is_active ? 'Hidden (kept on old records)' : 'Back on the list')}>
                        {c.is_active ? 'Hide' : 'Show again'}
                      </Button>
                    </>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {editable && (
        <div className="flex items-start gap-2 border-t border-gray-100 p-3">
          <div className="flex-1"><Input label="New category" placeholder="Water features" value={name} error={err}
            onChange={(e) => { setName(e.target.value); setErr(undefined) }} onKeyDown={(e) => { if (e.key === 'Enter') add() }} /></div>
          <Button variant="primary" size="md" className={cn(TAP, 'mt-6 gap-1.5')} loading={pending} onClick={add}>
            <Plus size={14} /> Add
          </Button>
        </div>
      )}
    </LsSection>
  )
}
