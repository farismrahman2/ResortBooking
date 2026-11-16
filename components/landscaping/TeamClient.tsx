'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { setDuties } from '@/lib/actions/landscaping'
import { safeCall } from '@/lib/actions/safe-call'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/utils'
import type { LsMember } from '@/lib/queries/landscaping'
import { LsSection } from './ui'

const DUTIES = [
  { key: 'can_prepare', label: 'Prepare', hint: 'make requisitions, add bills' },
  { key: 'can_check', label: 'Check', hint: 'checks requisitions' },
  { key: 'can_approve', label: 'Approve', hint: 'approves (MD); sets up projects' },
  { key: 'can_pay', label: 'Pay', hint: 'pays bills, labour & food; holds cash' },
] as const
type DutyKey = typeof DUTIES[number]['key']

/** Who does what in Landscaping. The admin always has every duty. */
export function TeamClient({ members, editable }: { members: LsMember[]; editable: boolean }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [busy, setBusy] = useState<string | null>(null)
  function toggle(m: LsMember, key: DutyKey) {
    setBusy(m.user_id + key)
    start(async () => {
      const next = { can_prepare: m.can_prepare, can_check: m.can_check, can_approve: m.can_approve, can_pay: m.can_pay, [key]: !m[key] }
      const r = await safeCall(() => setDuties(m.user_id, next))
      setBusy(null)
      if (!r.success) { toast.error(r.error); return }
      const duty = DUTIES.find((d) => d.key === key)!.label
      toast.success(`Saved — ${m.name} ${next[key] ? 'can now' : 'no longer can'} ${duty.toLowerCase()}`)
      router.refresh()
    })
  }
  const locked = (m: LsMember, k: DutyKey) => !editable || m.role === 'admin' || (pending && busy === m.user_id + k)

  /** A whole tappable box: the label wraps the checkbox. */
  const toggleBox = (m: LsMember, d: typeof DUTIES[number], showLabel?: boolean) => (
    <label key={d.key} className={cn('flex min-h-[40px] w-full items-center gap-2 rounded-lg px-2',
      showLabel ? 'border border-gray-200' : 'justify-center',
      locked(m, d.key) ? 'cursor-default opacity-70' : 'cursor-pointer hover:bg-forest-50',
      showLabel && m[d.key] && 'border-forest-300 bg-forest-50')}>
      <input type="checkbox" className="h-5 w-5 flex-shrink-0 rounded border-gray-300 accent-forest-700" checked={m[d.key]}
        disabled={locked(m, d.key)} onChange={() => toggle(m, d.key)} aria-label={`${d.label} — ${m.name}`} />
      {showLabel && <span className="text-sm text-gray-800">{d.label}</span>}
    </label>
  )

  return (
    <LsSection title="Who does what" meta={editable ? 'tick a box to change it — it saves straight away' : undefined}>
      {/* Phones: one card per person */}
      <ul className="divide-y divide-gray-100 sm:hidden">
        {members.map((m) => (
          <li key={m.user_id} className="px-4 py-3">
            <p className="text-sm font-medium text-gray-900">{m.name}{m.role === 'admin' && <span className="ml-1 text-xs font-normal text-gray-500">(admin — everything)</span>}</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {DUTIES.map((d) => toggleBox(m, d, true))}
            </div>
          </li>
        ))}
      </ul>
      {/* Tablet / desktop: table */}
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs text-gray-500">
            <tr><th className="px-4 py-2">Person</th>{DUTIES.map((d) => <th key={d.key} className="px-2 py-2 text-center">{d.label}<span className="block text-[11px] font-normal">{d.hint}</span></th>)}</tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.user_id} className="border-t border-gray-100">
                <td className="px-4 py-2 font-medium">{m.name}{m.role === 'admin' && <span className="ml-1 text-xs text-gray-500">(admin — everything)</span>}</td>
                {DUTIES.map((d) => <td key={d.key} className="p-1 text-center">{toggleBox(m, d)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="border-t border-gray-100 px-4 py-2 text-xs text-gray-500 sm:hidden">
        {DUTIES.map((d) => <li key={d.key}><b className="font-medium text-gray-700">{d.label}</b> — {d.hint}</li>)}
      </ul>
    </LsSection>
  )
}
