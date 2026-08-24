'use client'

import { useEffect, useRef, useState } from 'react'
import { Download, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { AvailabilityGrid } from './AvailabilityGrid'
import { MonthCalendar } from './MonthCalendar'
import type { AvailabilityResult, RoomInventoryRow } from '@/lib/supabase/types'
import type { DailyReportRow } from '@/lib/queries/daily-report'

interface AvailabilityCalendarProps {
  inventory: RoomInventoryRow[]
}

type PackageFilter = 'all' | 'daylong' | 'night'

function buildCsvReport(date: string, rows: DailyReportRow[]): string {
  const formattedDate = new Date(date + 'T00:00:00').toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })

  const lines: string[] = [
    `Room Allocation Report — ${formattedDate}`,
    '',
    'Booking #,Guest Name,Phone,Type,Check-in,Check-out,Adults,Children (Paid),Children (Free),Room Numbers,Breakfast,Lunch,Dinner,Snacks',
  ]

  for (const row of rows) {
    const allRoomNums = row.rooms.flatMap((r) => r.room_numbers).join(' / ') || '(not assigned)'
    const type  = row.package_type === 'daylong' ? 'Daylong' : `Night (${row.nights ?? '?'}N)`
    const checkin  = row.is_checkin  ? `Check-in`  : ''
    const checkout = row.is_checkout ? `Check-out` : ''
    const flag = [checkin, checkout].filter(Boolean).join('+') || 'Staying'
    lines.push([
      row.booking_number,
      `"${row.customer_name}"`,
      row.customer_phone,
      `"${type} (${flag})"`,
      row.visit_date,
      row.check_out_date ?? '',
      row.adults,
      row.children_paid,
      row.children_free,
      `"${allRoomNums}"`,
      row.meals.breakfast || '',
      row.meals.lunch     || '',
      row.meals.dinner    || '',
      row.meals.snacks    || '',
    ].join(','))
  }

  // Meal totals summary
  if (rows.length > 0) {
    const totals = rows.reduce(
      (acc, r) => ({
        breakfast: acc.breakfast + r.meals.breakfast,
        lunch:     acc.lunch     + r.meals.lunch,
        dinner:    acc.dinner    + r.meals.dinner,
        snacks:    acc.snacks    + r.meals.snacks,
      }),
      { breakfast: 0, lunch: 0, dinner: 0, snacks: 0 },
    )
    lines.push('')
    lines.push(`MEAL TOTALS,,,,,,,,,, ${totals.breakfast}, ${totals.lunch}, ${totals.dinner}, ${totals.snacks}`)
    lines.push(`,,,,,,,,,,Breakfast,Lunch,Dinner,Snacks`)
  }

  return lines.join('\n')
}

function downloadCsv(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href     = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

interface DayGuests {
  bookings: number; adults: number; children: number; drivers: number; guests: number
  daylong_bookings: number; daylong_guests: number
  night_bookings: number; night_guests: number
  arriving: number
}

export function AvailabilityCalendar({ inventory }: AvailabilityCalendarProps) {
  const today = new Date().toISOString().split('T')[0]
  const [selectedDate,  setSelectedDate]  = useState(today)
  const [packageType,   setPackageType]   = useState<PackageFilter>('all')
  const [result,        setResult]        = useState<AvailabilityResult[] | null>(null)
  const [loading,       setLoading]       = useState(false)
  const [error,         setError]         = useState<string | null>(null)
  const [downloading,   setDownloading]   = useState(false)
  const [menuOpen,      setMenuOpen]      = useState(false)
  const menuRef                           = useRef<HTMLDivElement | null>(null)
  const [guests,        setGuests]        = useState<DayGuests | null>(null)
  const [guestsLoading, setGuestsLoading] = useState(false)
  const guestsSeq                         = useRef(0)

  // Close the download menu on outside click / Escape
  useEffect(() => {
    if (!menuOpen) return
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false) }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  function openPrint(lang: 'en' | 'bn') {
    if (!selectedDate) return
    setMenuOpen(false)
    window.open(`/print/daily-report?date=${selectedDate}&lang=${lang}`, '_blank', 'noopener')
  }

  async function check(dateOverride?: string) {
    const date = dateOverride ?? selectedDate
    if (!date) return
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ date })
      if (packageType !== 'all') params.set('type', packageType)
      const res = await fetch(`/api/availability?${params}`)
      if (!res.ok) throw new Error(`Error ${res.status}: ${await res.text()}`)
      const data = await res.json()
      setResult(data.rooms)
    } catch (err) {
      setError(String(err))
      setResult(null)
    } finally {
      setLoading(false)
    }
  }

  // Who's on site that day — fetched on every date tap so the answer is one
  // tap away instead of buried in the room-allocation download.
  async function fetchGuests(date: string) {
    const seq = ++guestsSeq.current
    setGuestsLoading(true)
    try {
      const res = await fetch(`/api/day-guests?date=${date}`)
      if (!res.ok) throw new Error(await res.text())
      const data = (await res.json()) as DayGuests
      if (guestsSeq.current === seq) setGuests(data)   // ignore stale responses
    } catch {
      if (guestsSeq.current === seq) setGuests(null)
    } finally {
      if (guestsSeq.current === seq) setGuestsLoading(false)
    }
  }

  function handleCalendarClick(date: string) {
    setSelectedDate(date)
    void check(date)
    void fetchGuests(date)
  }

  async function downloadAllocation() {
    if (!selectedDate) return
    setDownloading(true)
    try {
      const res = await fetch(`/api/daily-report?date=${selectedDate}`)
      if (!res.ok) throw new Error(`Error ${res.status}: ${await res.text()}`)
      const data = await res.json()
      const csv  = buildCsvReport(selectedDate, data.rows)
      downloadCsv(csv, `room-allocation-${selectedDate}.csv`)
    } catch (err) {
      setError(String(err))
    } finally {
      setDownloading(false)
    }
  }

  const totalAvailable = result?.reduce((sum, r) => sum + r.available, 0) ?? 0

  const formattedDate = selectedDate
    ? new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-GB', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      })
    : ''

  return (
    <div className="space-y-6 p-6">
      {/* Calendar — month-at-a-glance availability */}
      <MonthCalendar
        selectedDate={selectedDate}
        onDateClick={handleCalendarClick}
        inventory={inventory}
      />

      {/* Tap-a-date guest summary — who's on site, without opening the
          room-allocation download. */}
      {(guests || guestsLoading) && (
        <div className="rounded-xl border border-forest-200 bg-forest-50/50 p-4">
          {guestsLoading ? (
            <p className="text-sm text-gray-500">Counting guests for {formattedDate}…</p>
          ) : guests && (
            <>
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="text-sm font-semibold text-forest-900">{formattedDate}</span>
                <span className="text-2xl font-bold tabular-nums text-forest-900">
                  {guests.guests.toLocaleString('en-IN')}
                </span>
                <span className="text-sm text-forest-800">guest{guests.guests === 1 ? '' : 's'} on site</span>
              </div>
              <p className="mt-1 text-xs text-gray-700">
                {guests.adults.toLocaleString('en-IN')} adults
                {guests.children > 0 && ` · ${guests.children.toLocaleString('en-IN')} children`}
                {guests.drivers > 0 && ` · ${guests.drivers.toLocaleString('en-IN')} drivers`}
                {' — '}
                {guests.daylong_bookings > 0 && `${guests.daylong_bookings} daylong (${guests.daylong_guests.toLocaleString('en-IN')} guests)`}
                {guests.daylong_bookings > 0 && guests.night_bookings > 0 && ' · '}
                {guests.night_bookings > 0 && `${guests.night_bookings} night stay${guests.night_bookings === 1 ? '' : 's'} (${guests.night_guests.toLocaleString('en-IN')} guests)`}
                {guests.bookings === 0 && 'no bookings on this date'}
                {guests.arriving > 0 && ` · ${guests.arriving} arriving that day`}
              </p>
            </>
          )}
        </div>
      )}

      {/* Controls */}
      <div className="flex flex-wrap items-end gap-4 rounded-xl border border-gray-200 bg-white p-5">
        <div>
          <label className="field-label">Select Date</label>
          <input
            type="date"
            min={today}
            value={selectedDate}
            onChange={(e) => { setSelectedDate(e.target.value); setResult(null) }}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-forest-600 focus:outline-none focus:ring-2 focus:ring-forest-200"
          />
        </div>

        <div>
          <label className="field-label">Package Type</label>
          <div className="flex gap-4 py-1">
            {(['all', 'daylong', 'night'] as const).map((t) => (
              <label key={t} className="flex cursor-pointer items-center gap-1.5 text-sm">
                <input
                  type="radio"
                  name="packageType"
                  value={t}
                  checked={packageType === t}
                  onChange={() => { setPackageType(t); setResult(null) }}
                  className="accent-forest-700"
                />
                {t === 'all' ? 'All' : t.charAt(0).toUpperCase() + t.slice(1)}
              </label>
            ))}
          </div>
        </div>

        <div className="flex gap-2">
          <Button onClick={() => check()} loading={loading} disabled={!selectedDate}>
            Check Availability
          </Button>
          <div ref={menuRef} className="relative">
            <Button
              variant="outline"
              onClick={() => setMenuOpen((v) => !v)}
              disabled={!selectedDate}
            >
              <Download size={14} className="mr-1.5" />
              Download Room Allocation
              <ChevronDown size={14} className="ml-1.5" />
            </Button>
            {menuOpen && (
              <div className="absolute right-0 z-20 mt-1 w-56 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
                <button
                  type="button"
                  onClick={() => openPrint('en')}
                  className="block w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                >
                  Save as PDF — English
                </button>
                <button
                  type="button"
                  onClick={() => openPrint('bn')}
                  className="block w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                >
                  Save as PDF — বাংলা
                </button>
                <div className="my-1 border-t border-gray-100" />
                <button
                  type="button"
                  onClick={() => { setMenuOpen(false); void downloadAllocation() }}
                  disabled={downloading}
                  className="block w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  {downloading ? 'Preparing CSV…' : 'Download CSV'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-gray-900">{formattedDate}</h2>
              <p className="text-sm text-gray-500">
                {totalAvailable} room unit{totalAvailable !== 1 ? 's' : ''} available
                {packageType !== 'all' && ` · ${packageType} packages`}
              </p>
            </div>
          </div>
          <AvailabilityGrid rooms={result} />
        </div>
      )}
    </div>
  )
}
