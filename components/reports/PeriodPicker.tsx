'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { Calendar } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { PeriodPreset } from '@/lib/reports/types'

const QUICK: Array<{ value: PeriodPreset; label: string }> = [
  { value: 'today',      label: 'Today' },
  { value: 'yesterday',  label: 'Yesterday' },
  { value: 'this_week',  label: 'This week' },
  { value: 'this_month', label: 'This month' },
  { value: 'last_month', label: 'Last month' },
]
const MORE: Array<{ value: PeriodPreset; label: string }> = [
  { value: 'last_week',     label: 'Last week' },
  { value: 'last_30_days',  label: 'Last 30 days' },
  { value: 'last_90_days',  label: 'Last 90 days' },
  { value: 'this_quarter',  label: 'This quarter' },
  { value: 'last_quarter',  label: 'Last quarter' },
  { value: 'this_year',     label: 'This year' },
  { value: 'ytd',           label: 'Year to date' },
]

interface Props {
  current: PeriodPreset
  customFrom?: string
  customTo?: string
  /** The dates actually shown (yyyy-mm-dd), so From/To always display the window in use. */
  from?: string
  to?: string
}

/**
 * The report date selector: one-tap quick ranges, more ranges in a list, and
 * From / To dates that are always visible — picking either makes it a custom
 * range. Big enough to use on a phone.
 */
export function PeriodPicker({ current, customFrom, customTo, from, to }: Props) {
  const router = useRouter()
  const params = useSearchParams()
  const shownFrom = customFrom ?? from ?? ''
  const shownTo = customTo ?? to ?? ''

  function go(next: { period: PeriodPreset; from?: string; to?: string }) {
    const sp = new URLSearchParams(params.toString())
    sp.set('period', next.period)
    if (next.period === 'custom') {
      if (next.from) sp.set('from', next.from); else sp.delete('from')
      if (next.to) sp.set('to', next.to); else sp.delete('to')
    } else {
      sp.delete('from'); sp.delete('to')
    }
    router.replace(`?${sp.toString()}`, { scroll: false })
  }

  const chip = (active: boolean) => cn(
    'inline-flex min-h-[38px] flex-shrink-0 items-center rounded-full border px-3.5 text-sm transition-colors',
    active ? 'border-forest-600 bg-forest-700 font-medium text-white' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50',
  )
  const dateBox = 'min-h-[40px] w-full rounded-lg border border-gray-300 bg-white px-2.5 text-sm focus:border-forest-600 focus:outline-none focus:ring-2 focus:ring-forest-200'
  const inMore = MORE.some((m) => m.value === current)

  return (
    <div className="w-full space-y-2">
      <div className="-mx-1 flex items-center gap-1.5 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none]">
        <Calendar size={16} className="flex-shrink-0 text-forest-700" aria-hidden />
        {QUICK.map((q) => (
          <button key={q.value} type="button" className={chip(current === q.value)} onClick={() => go({ period: q.value })}>
            {q.label}
          </button>
        ))}
        <select
          aria-label="More date ranges"
          value={inMore ? current : ''}
          onChange={(e) => e.target.value && go({ period: e.target.value as PeriodPreset })}
          className={cn(chip(inMore), 'appearance-auto pr-2')}
        >
          <option value="">More…</option>
          {MORE.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:flex sm:items-end sm:gap-3">
        <label className="block sm:w-44">
          <span className="mb-0.5 block text-[11px] font-semibold uppercase tracking-wide text-gray-500">From</span>
          <input type="date" value={shownFrom} max={shownTo || undefined} className={dateBox}
            onChange={(e) => e.target.value && go({ period: 'custom', from: e.target.value, to: shownTo || e.target.value })} />
        </label>
        <label className="block sm:w-44">
          <span className="mb-0.5 block text-[11px] font-semibold uppercase tracking-wide text-gray-500">To</span>
          <input type="date" value={shownTo} min={shownFrom || undefined} className={dateBox}
            onChange={(e) => e.target.value && go({ period: 'custom', from: shownFrom || e.target.value, to: e.target.value })} />
        </label>
      </div>
    </div>
  )
}
