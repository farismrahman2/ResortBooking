'use client'

import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight } from 'lucide-react'

interface MonthSelectorBarProps {
  month: string   // YYYY-MM
}

function parseMonth(month: string): { y: number; m: number } {
  const [y, m] = month.split('-').map(Number)
  return { y, m }
}

function formatMonth(y: number, m: number): string {
  return `${y}-${String(m).padStart(2, '0')}`
}

function shiftMonth(month: string, by: number): string {
  const { y, m } = parseMonth(month)
  const total = (y * 12 + (m - 1)) + by
  const newY  = Math.floor(total / 12)
  const newM  = (total % 12) + 1
  return formatMonth(newY, newM)
}

export function MonthSelectorBar({ month }: MonthSelectorBarProps) {
  const router = useRouter()
  const { y, m } = parseMonth(month)
  const label = new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })

  function go(newMonth: string) {
    router.push(`/expenses/report?month=${newMonth}`)
  }

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => go(shiftMonth(month, -1))}
        className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
        title="Previous month"
      >
        <ChevronLeft size={14} />
      </button>
      <input
        type="month"
        value={month}
        onChange={(e) => go(e.target.value)}
        className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium tabular-nums focus:border-forest-500 focus:outline-none focus:ring-2 focus:ring-forest-200"
      />
      <button
        onClick={() => go(shiftMonth(month, +1))}
        className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
        title="Next month"
      >
        <ChevronRight size={14} />
      </button>
      <span className="ml-2 text-sm font-semibold text-gray-700">{label}</span>
    </div>
  )
}
