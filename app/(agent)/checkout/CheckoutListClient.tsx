'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { cn } from '@/lib/utils'

const FILTERS = [
  { value: 'today',     label: 'Today' },
  { value: 'drafts',    label: 'Drafts' },
  { value: 'finalized', label: 'Finalized' },
  { value: 'all',       label: 'All' },
] as const

export function CheckoutFilterBar({ active }: { active: string }) {
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
            'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
            active === f.value
              ? 'bg-violet-100 text-violet-800'
              : 'text-gray-600 hover:bg-gray-50',
          )}
        >
          {f.label}
        </button>
      ))}
    </div>
  )
}
