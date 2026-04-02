'use client'

import { forwardRef, type InputHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

interface NumberInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'onChange'> {
  label?: string
  error?: string
  hint?: string
  prefix?: string   // e.g. '৳'
  suffix?: string   // e.g. '%'
  onChange?: (value: number) => void
}

/**
 * Integer-only number input with optional BDT prefix.
 * Strips non-numeric characters on input.
 */
const NumberInput = forwardRef<HTMLInputElement, NumberInputProps>(
  ({ className, label, error, hint, id, prefix, suffix, onChange, defaultValue, value, ...props }, ref) => {
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-')

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value.replace(/[^\d]/g, '')
      const num = raw === '' ? 0 : parseInt(raw, 10)
      onChange?.(isNaN(num) ? 0 : num)
    }

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={inputId} className="field-label">
            {label}
          </label>
        )}
        <div className="relative">
          {prefix && (
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500 pointer-events-none select-none">
              {prefix}
            </span>
          )}
          <input
            ref={ref}
            id={inputId}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={value !== undefined ? String(value) : undefined}
            defaultValue={defaultValue}
            onChange={handleChange}
            className={cn(
              'w-full rounded-lg border border-gray-300 bg-white py-2 text-sm font-mono',
              prefix ? 'pl-7' : 'pl-3',
              suffix ? 'pr-8' : 'pr-3',
              'placeholder:text-gray-400',
              'focus:border-forest-600 focus:outline-none focus:ring-2 focus:ring-forest-200',
              'disabled:bg-gray-50 disabled:text-gray-500',
              error && 'border-red-400 focus:border-red-400 focus:ring-red-100',
              className,
            )}
            {...props}
          />
          {suffix && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-500 pointer-events-none select-none">
              {suffix}
            </span>
          )}
        </div>
        {hint && !error && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </div>
    )
  },
)
NumberInput.displayName = 'NumberInput'

export { NumberInput }
