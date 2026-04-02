'use client'

import { cn } from '@/lib/utils'

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
    <div className={cn('border-b border-gray-200', className)}>
      {/* overflow-x-auto so tabs scroll horizontally on small screens */}
      <div className="flex gap-1 overflow-x-auto" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
        {items.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={cn(
              'flex flex-shrink-0 items-center gap-1.5 whitespace-nowrap px-3 py-2.5 text-sm font-medium transition-colors',
              'border-b-2 -mb-px',
              'sm:px-4',
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
    </div>
  )
}
