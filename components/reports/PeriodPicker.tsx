'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { Calendar } from 'lucide-react'
import type { PeriodPreset } from '@/lib/reports/types'

const PRESETS: Array<{ value: PeriodPreset; label: string }> = [
  { value: 'today',         label: 'Today' },
  { value: 'yesterday',     label: 'Yesterday' },
  { value: 'this_week',     label: 'This week' },
  { value: 'last_week',     label: 'Last week' },
  { value: 'this_month',    label: 'This month' },
  { value: 'last_month',    label: 'Last month' },
  { value: 'last_30_days',  label: 'Last 30 days' },
  { value: 'last_90_days',  label: 'Last 90 days' },
  { value: 'this_quarter',  label: 'This quarter' },
  { value: 'last_quarter',  label: 'Last quarter' },
  { value: 'this_year',     label: 'This year' },
  { value: 'ytd',           label: 'YTD' },
  { value: 'custom',        label: 'Custom range…' },
]

interface Props {
  current: PeriodPreset
  customFrom?: string
  customTo?: string
}

export function PeriodPicker({ current, customFrom, customTo }: Props) {
  const router = useRouter()
  const params = useSearchParams()

  function update(next: Partial<{ period: PeriodPreset; from: string; to: string }>) {
    const sp = new URLSearchParams(params.toString())
    if (next.period) sp.set('period', next.period)
    if (next.from)   sp.set('from', next.from);  else if (next.period && next.period !== 'custom') sp.delete('from')
    if (next.to)     sp.set('to', next.to);      else if (next.period && next.period !== 'custom') sp.delete('to')
    router.replace(`?${sp.toString()}`, { scroll: false })
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Calendar size={14} className="text-gray-400" />
      <select
        value={current}
        onChange={(e) => update({ period: e.target.value as PeriodPreset })}
        className="rounded-lg border border-gray-300 bg-white py-1.5 pl-2 pr-7 text-sm text-gray-800 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-200"
      >
        {PRESETS.map((p) => (
          <option key={p.value} value={p.value}>{p.label}</option>
        ))}
      </select>

      {current === 'custom' && (
        <div className="flex items-center gap-1.5">
          <input
            type="date"
            value={customFrom ?? ''}
            onChange={(e) => update({ period: 'custom', from: e.target.value, to: customTo })}
            className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-200"
          />
          <span className="text-xs text-gray-400">→</span>
          <input
            type="date"
            value={customTo ?? ''}
            onChange={(e) => update({ period: 'custom', from: customFrom, to: e.target.value })}
            className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-200"
          />
        </div>
      )}
    </div>
  )
}
