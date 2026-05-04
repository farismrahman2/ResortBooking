'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { GitCompareArrows } from 'lucide-react'
import type { ComparisonMode } from '@/lib/reports/types'

const OPTIONS: Array<{ value: ComparisonMode; label: string }> = [
  { value: 'off',             label: 'Off' },
  { value: 'previous_period', label: 'Previous period' },
  { value: 'year_over_year',  label: 'Year-over-year' },
  { value: 'both',            label: 'Both' },
]

interface Props {
  current: ComparisonMode
}

export function ComparisonToggle({ current }: Props) {
  const router = useRouter()
  const params = useSearchParams()

  function update(next: ComparisonMode) {
    const sp = new URLSearchParams(params.toString())
    if (next === 'off') sp.delete('compare')
    else sp.set('compare', next)
    router.replace(`?${sp.toString()}`, { scroll: false })
  }

  return (
    <div className="flex items-center gap-2">
      <GitCompareArrows size={14} className="text-gray-400" />
      <select
        value={current}
        onChange={(e) => update(e.target.value as ComparisonMode)}
        className="rounded-lg border border-gray-300 bg-white py-1.5 pl-2 pr-7 text-sm text-gray-800 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-200"
        title="Comparison mode"
      >
        {OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>Compare: {o.label}</option>
        ))}
      </select>
    </div>
  )
}
