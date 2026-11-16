'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { setDuties } from '@/lib/actions/landscaping'
import { safeCall } from '@/lib/actions/safe-call'
import { toast } from '@/lib/toast'
import type { LsMember } from '@/lib/queries/landscaping'

const DUTIES = [
  { key: 'can_prepare', label: 'Prepare', hint: 'make requisitions, add bills' },
  { key: 'can_check', label: 'Check', hint: 'checks requisitions' },
  { key: 'can_approve', label: 'Approve', hint: 'approves (MD); sets up projects' },
  { key: 'can_pay', label: 'Pay', hint: 'pays bills, labour & food; holds cash' },
] as const

/** Who does what in Landscaping. The admin always has every duty. */
export function TeamClient({ members, editable }: { members: LsMember[]; editable: boolean }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [busy, setBusy] = useState<string | null>(null)
  function toggle(m: LsMember, key: typeof DUTIES[number]['key']) {
    setBusy(m.user_id + key)
    start(async () => {
      const next = { can_prepare: m.can_prepare, can_check: m.can_check, can_approve: m.can_approve, can_pay: m.can_pay, [key]: !m[key] }
      const r = await safeCall(() => setDuties(m.user_id, next))
      setBusy(null)
      if (!r.success) { toast.error(r.error); return }
      router.refresh()
    })
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="w-full min-w-[560px] text-sm">
        <thead className="bg-gray-50 text-left text-xs text-gray-500">
          <tr><th className="px-4 py-2">Person</th>{DUTIES.map((d) => <th key={d.key} className="px-2 py-2 text-center">{d.label}<span className="block text-[10px] font-normal">{d.hint}</span></th>)}</tr>
        </thead>
        <tbody>
          {members.map((m) => (
            <tr key={m.user_id} className="border-t border-gray-100">
              <td className="px-4 py-2.5 font-medium">{m.name}{m.role === 'admin' && <span className="ml-1 text-xs text-gray-500">(admin — everything)</span>}</td>
              {DUTIES.map((d) => (
                <td key={d.key} className="px-2 py-2.5 text-center">
                  <input type="checkbox" className="h-5 w-5 rounded border-gray-300" checked={m[d.key]}
                    disabled={!editable || m.role === 'admin' || (pending && busy === m.user_id + d.key)} onChange={() => toggle(m, d.key)} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
