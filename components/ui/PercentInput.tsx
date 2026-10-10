'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

interface PercentInputProps {
  label:     string
  value:     number
  onChange:  (value: number) => void
  error?:    string
  hint?:     string
  max?:      number
}

/**
 * A percentage that may carry decimals (VAT at 7.5%). Keeps its own text so
 * a half-typed "7." survives until the next digit; the parent only ever
 * receives a clean number, capped at `max` and rounded to 2 places.
 */
export function PercentInput({ label, value, onChange, error, hint, max = 100 }: PercentInputProps) {
  const [text, setText] = useState(value ? String(value) : '0')
  // Follow outside changes (form reset, edit page load) without fighting typing.
  useEffect(() => {
    if (Number(text) !== value) setText(value ? String(value) : '0')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  const id = label.toLowerCase().replace(/\s+/g, '-')
  return (
    <div className="w-full">
      <label htmlFor={id} className="field-label">{label}</label>
      <div className="relative">
        <input
          id={id}
          type="text"
          inputMode="decimal"
          value={text}
          onChange={(e) => {
            let raw = e.target.value.replace(/[^\d.]/g, '')
            const dot = raw.indexOf('.')
            if (dot !== -1) raw = raw.slice(0, dot + 1) + raw.slice(dot + 1).replace(/\./g, '').slice(0, 2)
            setText(raw)
            const n = Math.min(max, Math.round((parseFloat(raw) || 0) * 100) / 100)
            onChange(n)
          }}
          onBlur={() => setText(value ? String(value) : '0')}
          className={cn(
            'w-full rounded-lg border border-gray-300 bg-white py-2 pl-3 pr-8 text-sm font-mono',
            'focus:border-forest-600 focus:outline-none focus:ring-2 focus:ring-forest-200',
            error && 'border-red-400 focus:border-red-400 focus:ring-red-100',
          )}
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 select-none text-sm text-gray-500">%</span>
      </div>
      {hint && !error && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  )
}
