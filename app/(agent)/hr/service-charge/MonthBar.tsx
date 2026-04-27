'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { formatPeriod } from '@/components/hr/labels'

interface Props {
  monthIso: string
}

export function MonthBar({ monthIso }: Props) {
  const router       = useRouter()
  const searchParams = useSearchParams()

  function shift(by: number) {
    const d = new Date(monthIso + 'T00:00:00')
    d.setMonth(d.getMonth() + by)
    const next = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
    const params = new URLSearchParams(searchParams.toString())
    params.set('month', next)
    router.replace(`?${params.toString()}`)
  }

  return (
    <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white p-3">
      <Button variant="outline" size="sm" onClick={() => shift(-1)} className="gap-1">
        <ChevronLeft size={14} /> Prev
      </Button>
      <p className="px-2 text-sm font-semibold text-gray-900">{formatPeriod(monthIso)}</p>
      <Button variant="outline" size="sm" onClick={() => shift(1)} className="gap-1">
        Next <ChevronRight size={14} />
      </Button>
    </div>
  )
}
