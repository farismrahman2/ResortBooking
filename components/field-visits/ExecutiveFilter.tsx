'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { UserRound } from 'lucide-react'

/** Narrows the report to one sales executive; keeps the period params. */
export function ExecutiveFilter({
  employees, current,
}: {
  employees: Array<{ id: string; full_name: string }>
  current: string
}) {
  const router = useRouter()
  const params = useSearchParams()

  function update(id: string) {
    const sp = new URLSearchParams(params.toString())
    if (id) sp.set('exec', id); else sp.delete('exec')
    router.replace(`?${sp.toString()}`, { scroll: false })
  }

  return (
    <label className="flex items-center gap-2">
      <UserRound size={14} className="text-gray-400" />
      <select
        value={current}
        onChange={(e) => update(e.target.value)}
        className="rounded-lg border border-gray-300 bg-white py-1.5 pl-2 pr-7 text-sm text-gray-800 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-200"
      >
        <option value="">All executives</option>
        {employees.map((e) => <option key={e.id} value={e.id}>{e.full_name}</option>)}
      </select>
    </label>
  )
}
