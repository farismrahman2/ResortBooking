'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { todayDhaka, addDaysIso } from '@/lib/dates'

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
  // Pure string arithmetic — the old local-midnight + toISOString() round trip
  // shifted the date back a day in any UTC+ browser, so in Bangladesh "Next"
  // was a no-op, "Prev" jumped two days, and "Today" could be yesterday.
  function shift(days: number) { goto(addDaysIso(date, days)) }
  function today() { goto(todayDhaka()) }

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
