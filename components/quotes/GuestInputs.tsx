'use client'

import { cn } from '@/lib/utils'

export interface GuestValues {
  adults: number
  children_paid: number
  children_free: number
  drivers: number
  extra_beds: number
}

interface GuestField {
  key: keyof GuestValues
  label: string
  hint: string
  min: number
  nightOnly?: boolean
}

const FIELDS: GuestField[] = [
  {
    key:   'adults',
    label: 'Adults',
    hint:  'Entry fee applies per adult',
    min:   1,
  },
  {
    key:   'children_paid',
    label: 'Children (4–9 yrs)',
    hint:  'Meal charge applies',
    min:   0,
  },
  {
    key:   'children_free',
    label: 'Children (<3 yrs)',
    hint:  'Free — no charge',
    min:   0,
  },
  {
    key:   'drivers',
    label: 'Drivers',
    hint:  'Driver entry fee applies',
    min:   0,
  },
  {
    key:       'extra_beds',
    label:     'Extra Beds',
    hint:      'Per bed per night charge',
    min:       0,
    nightOnly: true,
  },
]

interface GuestInputsProps {
  value: GuestValues
  onChange: (v: GuestValues) => void
  packageType?: 'daylong' | 'night'
}

function Spinner({
  value,
  min,
  onChange,
}: {
  value: number
  min: number
  onChange: (v: number) => void
}) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
        className={cn(
          'h-8 w-8 rounded-md border flex items-center justify-center text-sm font-semibold transition-colors',
          value > min
            ? 'border-gray-300 bg-white text-gray-700 hover:bg-gray-100'
            : 'border-gray-200 bg-gray-50 text-gray-300 cursor-not-allowed',
        )}
      >
        −
      </button>
      <span className="w-8 text-center text-sm font-semibold tabular-nums text-gray-900">
        {value}
      </span>
      <button
        type="button"
        onClick={() => onChange(value + 1)}
        className="h-8 w-8 rounded-md border border-gray-300 bg-white text-gray-700 text-sm font-semibold hover:bg-gray-100 flex items-center justify-center transition-colors"
      >
        +
      </button>
    </div>
  )
}

export function GuestInputs({ value, onChange, packageType = 'daylong' }: GuestInputsProps) {
  function update(key: keyof GuestValues, v: number) {
    onChange({ ...value, [key]: v })
  }

  const visibleFields = FIELDS.filter((f) => {
    if (f.nightOnly && packageType !== 'night') return false
    return true
  })

  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
      {visibleFields.map((field) => (
        <div key={field.key} className="flex flex-col gap-1">
          <span className="text-xs font-medium text-gray-700">{field.label}</span>
          <Spinner
            value={value[field.key]}
            min={field.min}
            onChange={(v) => update(field.key, v)}
          />
          <span className="text-xs text-gray-400">{field.hint}</span>
        </div>
      ))}
    </div>
  )
}
