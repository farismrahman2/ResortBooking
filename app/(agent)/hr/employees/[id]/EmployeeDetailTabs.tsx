'use client'

import { useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

type TabKey = 'profile' | 'salary' | 'attendance' | 'leaves' | 'loans' | 'adjustments' | 'payroll'

interface Tab {
  key:     TabKey
  label:   string
  content: ReactNode
}

interface Props {
  tabs: Tab[]
  initial?: TabKey
}

export function EmployeeDetailTabs({ tabs, initial = 'profile' }: Props) {
  const [active, setActive] = useState<TabKey>(initial)
  const current = tabs.find((t) => t.key === active) ?? tabs[0]
  return (
    <div>
      <div className="border-b border-gray-200 overflow-x-auto">
        <div className="flex gap-1 min-w-max">
          {tabs.map((t) => {
            const isActive = t.key === active
            return (
              <button
                key={t.key}
                onClick={() => setActive(t.key)}
                className={cn(
                  'px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap',
                  isActive
                    ? 'border-sky-600 text-sky-700'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300',
                )}
              >
                {t.label}
              </button>
            )
          })}
        </div>
      </div>
      <div className="pt-5">{current.content}</div>
    </div>
  )
}

export function ComingSoonPanel({ phase }: { phase: string }) {
  return (
    <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-12 text-center">
      <p className="text-sm font-medium text-gray-700">Coming in {phase}</p>
      <p className="mt-1 text-xs text-gray-500">
        This tab is wired up but the underlying feature ships in a later phase.
      </p>
    </div>
  )
}
