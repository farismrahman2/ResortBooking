'use client'

import { useState, useEffect } from 'react'
import { Calendar } from 'lucide-react'
import { DayPicker, type DateRange } from 'react-day-picker'
import 'react-day-picker/dist/style.css'
import { formatDate, toISODate } from '@/lib/formatters/dates'

/** Compact date label for narrow screens — "11 Apr" */
function shortDate(s: string): string {
  if (!s) return ''
  return new Date(s + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

interface DateRangePickerProps {
  from:      string   // ISO date
  to:        string   // ISO date
  onChange:  (range: { from: string; to: string }) => void
  presets?:  boolean
}

/** Compute common preset ranges against today */
function getPresets(): { label: string; from: string; to: string }[] {
  const today   = new Date()
  const thisMonthStart = new Date(today.getFullYear(), today.getMonth(), 1)
  const thisMonthEnd   = new Date(today.getFullYear(), today.getMonth() + 1, 0)
  const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1)
  const lastMonthEnd   = new Date(today.getFullYear(), today.getMonth(), 0)
  const q              = Math.floor(today.getMonth() / 3)
  const thisQStart     = new Date(today.getFullYear(), q * 3, 1)
  const thisQEnd       = new Date(today.getFullYear(), q * 3 + 3, 0)
  const thisYearStart  = new Date(today.getFullYear(), 0, 1)
  const thisYearEnd    = new Date(today.getFullYear(), 11, 31)

  return [
    { label: 'This month',   from: toISODate(thisMonthStart), to: toISODate(thisMonthEnd) },
    { label: 'Last month',   from: toISODate(lastMonthStart), to: toISODate(lastMonthEnd) },
    { label: 'This quarter', from: toISODate(thisQStart),     to: toISODate(thisQEnd) },
    { label: 'This year',    from: toISODate(thisYearStart),  to: toISODate(thisYearEnd) },
  ]
}

export function DateRangePicker({ from, to, onChange, presets = true }: DateRangePickerProps) {
  const [open, setOpen] = useState(false)

  // Show 1 month on small screens, 2 on >= sm. Updates on resize.
  const [numberOfMonths, setNumberOfMonths] = useState(1)
  useEffect(() => {
    function update() {
      setNumberOfMonths(typeof window !== 'undefined' && window.innerWidth >= 640 ? 2 : 1)
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  const selected: DateRange = {
    from: from ? new Date(from + 'T00:00:00') : undefined,
    to:   to   ? new Date(to   + 'T00:00:00') : undefined,
  }

  function handleSelect(range: DateRange | undefined) {
    if (!range) return
    const newFrom = range.from ? toISODate(range.from) : from
    const newTo   = range.to   ? toISODate(range.to)   : (range.from ? toISODate(range.from) : to)
    onChange({ from: newFrom, to: newTo })
    if (range.from && range.to) setOpen(false)
  }

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest-500 max-w-full"
      >
        <Calendar size={14} className="flex-shrink-0" />
        {/* Short labels on mobile, long on sm+ */}
        <span className="tabular-nums sm:hidden">{shortDate(from)}</span>
        <span className="tabular-nums hidden sm:inline">{formatDate(from)}</span>
        <span className="text-gray-400">→</span>
        <span className="tabular-nums sm:hidden">{shortDate(to)}</span>
        <span className="tabular-nums hidden sm:inline">{formatDate(to)}</span>
      </button>

      {open && (
        <>
          {/* Backdrop to close on outside click */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          {/*
            Popover positioning: anchored to the trigger but capped at the viewport width on
            mobile so the calendar doesn't bleed past the right edge. `max-w-[calc(100vw-2rem)]`
            keeps a small gutter; horizontal scroll on the inner DayPicker handles the rest.
          */}
          <div className="absolute top-full left-0 z-50 mt-2 max-w-[calc(100vw-2rem)] overflow-x-auto rounded-lg border border-gray-200 bg-white p-4 shadow-lg">
            {presets && (
              <div className="mb-3 flex flex-wrap gap-2">
                {getPresets().map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => { onChange({ from: p.from, to: p.to }); setOpen(false) }}
                    className="rounded-md border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-600 hover:border-forest-300 hover:bg-forest-50 hover:text-forest-700 transition-colors"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            )}
            <DayPicker
              mode="range"
              selected={selected}
              onSelect={handleSelect}
              numberOfMonths={numberOfMonths}
              classNames={{
                caption:       'flex justify-center py-2 relative items-center text-sm font-medium',
                head_cell:     'text-[10px] font-semibold uppercase text-gray-400 pb-2',
                cell:          'text-xs p-0 relative',
                day:           'h-8 w-8 p-0 font-normal rounded-md hover:bg-forest-50 transition-colors',
                day_selected:  'bg-forest-600 text-white hover:bg-forest-700',
                day_today:     'font-bold text-forest-700',
                day_range_middle: 'bg-forest-100 text-forest-900 rounded-none',
                day_range_start: 'bg-forest-600 text-white rounded-l-md rounded-r-none',
                day_range_end:   'bg-forest-600 text-white rounded-r-md rounded-l-none',
              }}
            />
          </div>
        </>
      )}
    </div>
  )
}
