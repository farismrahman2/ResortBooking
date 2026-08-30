'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { cn } from '@/lib/utils'

const FILTERS = [
  { value: 'today',     label: 'Today' },
  { value: 'past_due',  label: 'Past due' },
  { value: 'drafts',    label: 'Drafts' },
  { value: 'finalized', label: 'Finalized' },
  { value: 'all',       label: 'All' },
] as const

export function CheckoutFilterBar({ active, pastDueCount = 0 }: {
  active: string
  /** Shown on the Past due tab so nobody has to open it to know it's empty. */
  pastDueCount?: number
}) {
  const router       = useRouter()
  const searchParams = useSearchParams()

  function update(value: string) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('filter', value)
    router.replace(`/checkout?${params.toString()}`)
  }

  return (
    <div className="flex flex-wrap gap-1 rounded-xl border border-gray-200 bg-white p-1.5">
      {FILTERS.map((f) => (
        <button
          key={f.value}
          type="button"
          onClick={() => update(f.value)}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
            active === f.value
              ? 'bg-violet-100 text-violet-800'
              : 'text-gray-600 hover:bg-gray-50',
          )}
        >
          {f.label}
          {f.value === 'past_due' && pastDueCount > 0 && (
            <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700">
              {pastDueCount}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}
