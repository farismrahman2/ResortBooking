'use client'

import { cn } from '@/lib/utils'

/**
 * Mobile-first primitives for the field-visit wizard.
 * Every interactive element is >= 44px tall and full-width tappable — the rep
 * is standing in a client's lobby using one thumb, not a mouse.
 */

export function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <span className="mb-1.5 block text-sm font-medium text-gray-800">
      {children}
      {required && <span className="ml-0.5 text-red-500">*</span>}
    </span>
  )
}

/** Multi-select as toggle chips — filled amber when on, outline when off. */
export function ChipGroup({
  options, value, onChange, columns = 2,
}: {
  options: readonly string[] | { value: string; label: string }[]
  value:   string[]
  onChange: (next: string[], justToggled: string) => void
  columns?: 1 | 2
}) {
  const norm = (options as (string | { value: string; label: string })[]).map((o) =>
    typeof o === 'string' ? { value: o, label: o } : o,
  )
  function toggle(v: string) {
    const next = value.includes(v) ? value.filter((x) => x !== v) : [...value, v]
    onChange(next, v)
  }
  return (
    <div className={cn('grid gap-2', columns === 2 ? 'grid-cols-2' : 'grid-cols-1')}>
      {norm.map((o) => {
        const on = value.includes(o.value)
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => toggle(o.value)}
            aria-pressed={on}
            className={cn(
              'min-h-[44px] rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors text-left',
              on
                ? 'border-amber-500 bg-amber-100 text-amber-900'
                : 'border-gray-300 bg-white text-gray-700 active:bg-gray-50',
            )}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

/** Single-select as full-width tappable rows. */
export function RadioRows<T extends string>({
  options, value, onChange, columns = 1,
}: {
  options: { value: T; label: string }[]
  value:   T | null | undefined
  onChange: (v: T) => void
  columns?: 1 | 2
}) {
  return (
    <div className={cn('grid gap-2', columns === 2 ? 'grid-cols-2' : 'grid-cols-1')}>
      {options.map((o) => {
        const on = value === o.value
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            aria-pressed={on}
            className={cn(
              'flex min-h-[44px] items-center gap-2.5 rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors text-left',
              on
                ? 'border-amber-500 bg-amber-100 text-amber-900'
                : 'border-gray-300 bg-white text-gray-700 active:bg-gray-50',
            )}
          >
            <span className={cn(
              'flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border-2',
              on ? 'border-amber-600' : 'border-gray-400',
            )}>
              {on && <span className="h-2 w-2 rounded-full bg-amber-600" />}
            </span>
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

export function TextField({
  label, value, onChange, placeholder, required, type = 'text', inputMode, error, hint,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  required?: boolean
  type?: string
  inputMode?: 'text' | 'numeric' | 'tel' | 'email'
  error?: string
  hint?: string
}) {
  const id = `fv-${label.replace(/\s+/g, '-').toLowerCase()}`
  return (
    <div>
      <label htmlFor={id}><FieldLabel required={required}>{label}</FieldLabel></label>
      <input
        id={id}
        type={type}
        inputMode={inputMode}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          'min-h-[44px] w-full rounded-xl border px-3 py-2.5 text-base',
          'focus:outline-none focus:ring-2 focus:ring-amber-200',
          error ? 'border-red-400 focus:border-red-500' : 'border-gray-300 focus:border-amber-500',
        )}
      />
      {hint && !error && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
      {error && <p className="mt-1 text-xs font-medium text-red-600">{error}</p>}
    </div>
  )
}

export function TextAreaField({
  label, value, onChange, placeholder, rows = 3,
}: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; rows?: number
}) {
  const id = `fv-${label.replace(/\s+/g, '-').toLowerCase()}`
  return (
    <div>
      <label htmlFor={id}><FieldLabel>{label}</FieldLabel></label>
      <textarea
        id={id}
        rows={rows}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-base focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-200"
      />
    </div>
  )
}

export function SelectField({
  label, value, onChange, options, placeholder = '— Select —', required, error,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
  placeholder?: string
  required?: boolean
  error?: string
}) {
  const id = `fv-${label.replace(/\s+/g, '-').toLowerCase()}`
  return (
    <div>
      <label htmlFor={id}><FieldLabel required={required}>{label}</FieldLabel></label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          'min-h-[44px] w-full rounded-xl border bg-white px-3 py-2.5 text-base',
          'focus:outline-none focus:ring-2 focus:ring-amber-200',
          error ? 'border-red-400' : 'border-gray-300 focus:border-amber-500',
        )}
      >
        <option value="">{placeholder}</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {error && <p className="mt-1 text-xs font-medium text-red-600">{error}</p>}
    </div>
  )
}

export function StepSection({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      {title && <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500">{title}</h2>}
      {children}
    </section>
  )
}
