'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { Input } from '@/components/ui/Input'

export function DateRangeBar({ from, to }: { from: string; to: string }) {
  const router       = useRouter()
  const searchParams = useSearchParams()

  function update(name: 'from' | 'to', value: string) {
    const p = new URLSearchParams(searchParams.toString())
    p.set(name, value)
    router.replace(`/hr/sales?${p.toString()}`)
  }

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-xl border border-gray-200 bg-white p-3">
      <div>
        <Input
          label="From"
          type="date"
          value={from}
          onChange={(e) => update('from', e.target.value)}
        />
      </div>
      <div>
        <Input
          label="To"
          type="date"
          value={to}
          onChange={(e) => update('to', e.target.value)}
        />
      </div>
      <p className="text-xs text-gray-500 ml-auto">
        Range is on <strong>booking visit_date</strong>. Cancelled bookings excluded from revenue.
      </p>
    </div>
  )
}
