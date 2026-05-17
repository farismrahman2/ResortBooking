'use client'

import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { AvailabilityResult } from '@/lib/supabase/types'

const WEEKS_VISIBLE = 5

interface DaySummary {
  date:           string  // YYYY-MM-DD
  totalUnits:     number
  totalAvailable: number
}

interface MonthCalendarProps {
  selectedDate:   string
  onDateClick:    (date: string) => void
  totalInventory: number       // sum of all room types' total_units — used as the baseline for days the API returns no occupancy for
}

function isoOf(d: Date): string {
  // Local-date ISO (not UTC) so the grid lines up with the user's "today".
  const yyyy = d.getFullYear()
  const mm   = String(d.getMonth() + 1).padStart(2, '0')
  const dd   = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function startOfWeek(d: Date): Date {
  // Sunday-start
  const out = new Date(d)
  out.setHours(0, 0, 0, 0)
  out.setDate(out.getDate() - out.getDay())
  return out
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d)
  out.setDate(out.getDate() + n)
  return out
}

interface Band {
  bg:    string
  text:  string
  label: string
}

function bandFor(available: number, total: number): Band {
  if (total === 0)       return { bg: 'bg-gray-50',                          text: 'text-gray-400',    label: '—' }
  const pct = (total - available) / total
  if (pct === 0)         return { bg: 'bg-emerald-50',                       text: 'text-emerald-700', label: 'Empty' }
  if (pct <= 0.5)        return { bg: 'bg-emerald-100',                      text: 'text-emerald-800', label: 'Open' }
  if (pct <= 0.8)        return { bg: 'bg-amber-100',                        text: 'text-amber-800',   label: 'Filling' }
  if (pct < 1)           return { bg: 'bg-red-100',                          text: 'text-red-800',     label: 'Tight' }
  return                       { bg: 'bg-red-600 hover:bg-red-700',          text: 'text-white',       label: 'Full' }
}

export function MonthCalendar({ selectedDate, onDateClick, totalInventory }: MonthCalendarProps) {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()))
  const [days,      setDays]      = useState<Map<string, DaySummary> | null>(null)
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState<string | null>(null)

  const today = isoOf(new Date())

  // Only depends on weekStart (stable across renders) and totalInventory (a number,
  // so referentially stable). Critically we do NOT depend on a `windowEnd` Date
  // object — that would be a fresh reference every render and turn the effect
  // into an infinite re-fetch loop.
  useEffect(() => {
    let cancelled = false
    const winEnd = addDays(weekStart, WEEKS_VISIBLE * 7 - 1)
    setLoading(true)
    setError(null)
    ;(async () => {
      try {
        const params = new URLSearchParams({ from: isoOf(weekStart), to: isoOf(winEnd) })
        const res = await fetch(`/api/availability?${params}`)
        if (!res.ok) throw new Error(`Error ${res.status}: ${await res.text()}`)
        const data = await res.json()
        if (cancelled) return

        // Pre-fill every visible day with full inventory. The RPC only returns
        // days that have *some* occupancy, so missing days mean "fully open".
        const map = new Map<string, DaySummary>()
        for (let i = 0; i < WEEKS_VISIBLE * 7; i++) {
          const iso = isoOf(addDays(weekStart, i))
          map.set(iso, { date: iso, totalUnits: totalInventory, totalAvailable: totalInventory })
        }
        for (const d of data.dates ?? []) {
          let totalUnits     = 0
          let totalAvailable = 0
          for (const r of d.rooms as AvailabilityResult[]) {
            totalUnits     += r.total_units
            totalAvailable += r.available
          }
          map.set(d.date, { date: d.date, totalUnits, totalAvailable })
        }
        setDays(map)
      } catch (err) {
        if (!cancelled) setError(String(err))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [weekStart, totalInventory])

  const windowEnd = addDays(weekStart, WEEKS_VISIBLE * 7 - 1)

  const cells = Array.from({ length: WEEKS_VISIBLE * 7 }, (_, i) => {
    const d   = addDays(weekStart, i)
    const iso = isoOf(d)
    return { date: iso, day: d.getDate(), isToday: iso === today, isPast: iso < today }
  })

  const startLabel = weekStart.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  const endLabel   = windowEnd.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      {/* Header */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold text-gray-900">Calendar</h2>
          <p className="text-xs text-gray-500">{startLabel} → {endLabel}</p>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setWeekStart((d) => addDays(d, -7))}
            className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
            aria-label="Previous week"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            type="button"
            onClick={() => setWeekStart(startOfWeek(new Date()))}
            className="rounded-md px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100"
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => setWeekStart((d) => addDays(d, 7))}
            className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
            aria-label="Next week"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* Weekday header */}
      <div className="mb-1 grid grid-cols-7 gap-1 text-center text-[10px] font-medium uppercase tracking-wide text-gray-500">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-7 gap-1">
        {cells.map((c) => {
          const summary    = days?.get(c.date)
          const band       = summary
            ? bandFor(summary.totalAvailable, summary.totalUnits)
            : { bg: 'bg-gray-50', text: 'text-gray-400', label: '' }
          const isSelected = c.date === selectedDate

          return (
            <button
              type="button"
              key={c.date}
              onClick={() => onDateClick(c.date)}
              className={[
                'group relative flex aspect-square flex-col items-start justify-between rounded-lg p-1.5 text-left transition sm:p-2',
                band.bg,
                'hover:ring-2 hover:ring-forest-400',
                c.isPast    ? 'opacity-60' : '',
                isSelected  ? 'ring-2 ring-forest-600' : '',
              ].join(' ')}
            >
              <div className="flex w-full items-start justify-between">
                <span className={`text-xs font-semibold sm:text-sm ${c.isToday ? 'text-forest-700' : band.text}`}>
                  {c.day}
                </span>
                {c.isToday && (
                  <span className="rounded-full bg-forest-700 px-1 py-px text-[8px] font-semibold uppercase text-white">
                    Today
                  </span>
                )}
              </div>
              {summary ? (
                <div className={`text-[11px] font-medium sm:text-xs ${band.text}`}>
                  {summary.totalAvailable === 0 ? 'Full' : (
                    <>
                      <span className="text-sm font-bold sm:text-base">{summary.totalAvailable}</span>
                      <span className="opacity-70">/{summary.totalUnits}</span>
                    </>
                  )}
                </div>
              ) : loading ? (
                <span className="text-[10px] text-gray-400">…</span>
              ) : null}
            </button>
          )
        })}
      </div>

      {/* Legend */}
      <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-gray-500">
        <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-emerald-100" /> Open</span>
        <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-amber-100" /> Filling</span>
        <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-red-100" /> Tight</span>
        <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-red-600" /> Full</span>
      </div>

      {error && (
        <p className="mt-2 text-xs text-red-600">{error}</p>
      )}
    </div>
  )
}
