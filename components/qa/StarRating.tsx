'use client'

import { Star } from 'lucide-react'
import { cn } from '@/lib/utils'

interface StarRatingProps {
  value:     number | null
  onChange?: (n: number) => void
  size?:     number
  label?:    string
  error?:    string
}

/** 1–5 star picker. Without `onChange` it renders as a read-only display. */
export function StarRating({ value, onChange, size = 24, label, error }: StarRatingProps) {
  return (
    <div>
      {label && <p className="field-label">{label}<span className="ml-1 text-red-500">*</span></p>}
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((n) => {
          const filled = value != null && n <= value
          const star = (
            <Star
              size={size}
              className={cn(
                'transition-colors',
                filled ? 'fill-amber-400 text-amber-400' : 'text-gray-300',
                onChange && 'hover:text-amber-400',
              )}
            />
          )
          if (!onChange) return <span key={n}>{star}</span>
          return (
            <button
              key={n}
              type="button"
              onClick={() => onChange(n)}
              className="rounded p-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest-600"
              aria-label={`${n} star${n > 1 ? 's' : ''}`}
            >
              {star}
            </button>
          )
        })}
        {value != null && <span className="ml-1.5 text-sm font-medium text-gray-600">{value}/5</span>}
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  )
}

/** Compact inline stars for tables/lists. */
export function StarsInline({ value }: { value: number | null }) {
  if (value == null) return <span className="text-xs text-gray-400">—</span>
  return (
    <span className="inline-flex items-center gap-0.5">
      <Star size={13} className="fill-amber-400 text-amber-400" />
      <span className="text-xs font-semibold tabular-nums text-gray-700">{value}</span>
    </span>
  )
}
