'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { setSalesStartDate } from '@/lib/actions/crm'

interface Props {
  userId:  string
  initial: string | null
}

export function SalesStartDateEditor({ userId, initial }: Props) {
  const router = useRouter()
  const [value, setValue] = useState(initial ?? '')
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  function save() {
    setError(null); setSaved(false)
    startTransition(async () => {
      const res = await setSalesStartDate(userId, value || null)
      if (!res.success) { setError(res.error); return }
      setSaved(true); router.refresh()
    })
  }

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
      <p className="text-sm font-semibold text-amber-900">Sales Start Date</p>
      <p className="mt-0.5 text-xs text-amber-800">The rep&apos;s onboarding &quot;Day 1&quot; — drives 30/60/90-day KPI targets.</p>
      <div className="mt-2 flex items-center gap-2">
        <input type="date" value={value} onChange={(e) => setValue(e.target.value)}
          className="rounded-lg border border-amber-300 px-3 py-1.5 text-sm focus:border-amber-500 focus:outline-none" />
        <Button size="sm" onClick={save} loading={pending}>Save</Button>
        {saved && <span className="text-xs text-emerald-700">Saved</span>}
      </div>
      {error && <p className="mt-1 text-xs text-red-700">{error}</p>}
    </div>
  )
}
