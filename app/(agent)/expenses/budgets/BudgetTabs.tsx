'use client'

import { useRouter } from 'next/navigation'
import type { BudgetPeriodType } from '@/lib/supabase/types'

interface BudgetTabsProps {
  period:      BudgetPeriodType
  periodStart: string
}

function shiftMonth(start: string, by: number): string {
  const [y, m] = start.split('-').map(Number)
  const total = (y * 12 + (m - 1)) + by
  const newY = Math.floor(total / 12)
  const newM = (total % 12) + 1
  return `${newY}-${String(newM).padStart(2, '0')}-01`
}

function shiftYear(start: string, by: number): string {
  const [y] = start.split('-').map(Number)
  return `${y + by}-01-01`
}

export function BudgetTabs({ period, periodStart }: BudgetTabsProps) {
  const router = useRouter()

  function go(newPeriod: BudgetPeriodType, newStart: string) {
    router.push(`/expenses/budgets?period=${newPeriod}&start=${newStart}`)
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Period type */}
      <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5">
        {(['monthly', 'yearly'] as BudgetPeriodType[]).map((p) => (
          <button
            key={p}
            onClick={() => {
              const today = new Date()
              const newStart = p === 'yearly'
                ? `${today.getFullYear()}-01-01`
                : `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`
              go(p, newStart)
            }}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              period === p
                ? 'bg-white text-forest-700 shadow-sm'
                : 'text-gray-500 hover:text-gray-800'
            }`}
          >
            {p === 'monthly' ? 'Monthly' : 'Annual'}
          </button>
        ))}
      </div>

      {/* Period nav */}
      <div className="flex items-center gap-1">
        <button
          onClick={() => go(period, period === 'yearly' ? shiftYear(periodStart, -1) : shiftMonth(periodStart, -1))}
          className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs hover:bg-gray-50"
        >
          ←
        </button>
        {period === 'monthly' ? (
          <input
            type="month"
            value={periodStart.slice(0, 7)}
            onChange={(e) => go(period, e.target.value + '-01')}
            className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs tabular-nums focus:border-forest-500 focus:outline-none focus:ring-2 focus:ring-forest-200"
          />
        ) : (
          <input
            type="number"
            min={2020}
            max={2099}
            value={periodStart.slice(0, 4)}
            onChange={(e) => go(period, `${e.target.value}-01-01`)}
            className="w-24 rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs tabular-nums focus:border-forest-500 focus:outline-none focus:ring-2 focus:ring-forest-200"
          />
        )}
        <button
          onClick={() => go(period, period === 'yearly' ? shiftYear(periodStart, +1) : shiftMonth(periodStart, +1))}
          className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs hover:bg-gray-50"
        >
          →
        </button>
      </div>
    </div>
  )
}
