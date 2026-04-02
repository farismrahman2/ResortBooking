'use client'

import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'

interface TabItem {
  id:    string
  label: string
  count?: number
}

interface TabsProps {
  items:     TabItem[]
  active:    string
  onChange:  (id: string) => void
  className?: string
}

export function Tabs({ items, active, onChange, className }: TabsProps) {
  return (
    <div className={cn('flex gap-1 border-b border-gray-200', className)}>
      {items.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={cn(
            'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors',
            'border-b-2 -mb-px',
            active === tab.id
              ? 'border-forest-700 text-forest-700'
              : 'border-transparent text-gray-600 hover:text-gray-900',
          )}
        >
          {tab.label}
          {tab.count !== undefined && (
            <span className={cn(
              'rounded-full px-1.5 py-0.5 text-xs font-semibold',
              active === tab.id ? 'bg-forest-100 text-forest-800' : 'bg-gray-100 text-gray-600',
            )}>
              {tab.count}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}
