'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { ChevronLeft, ChevronRight } from 'lucide-react'

interface Props {
  date: string
}

export function AttendanceDateBar({ date }: Props) {
  const router       = useRouter()
  const searchParams = useSearchParams()

  function goto(d: string) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('date', d)
    router.replace(`/hr/attendance?${params.toString()}`)
  }
  function shift(days: number) {
    const d = new Date(date + 'T00:00:00')
    d.setDate(d.getDate() + days)
    goto(d.toISOString().slice(0, 10))
  }
  function today() { goto(new Date().toISOString().slice(0, 10)) }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-white p-3">
      <Button variant="outline" size="sm" onClick={() => shift(-1)} className="gap-1">
        <ChevronLeft size={14} /> Prev
      </Button>
      <Input
        type="date"
        value={date}
        onChange={(e) => goto(e.target.value)}
        className="!w-44"
      />
      <Button variant="outline" size="sm" onClick={() => shift(1)} className="gap-1">
        Next <ChevronRight size={14} />
      </Button>
      <Button variant="ghost" size="sm" onClick={today}>Today</Button>
    </div>
  )
}
