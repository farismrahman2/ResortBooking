'use client'

import { useState } from 'react'
import { Download } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { AvailabilityGrid } from './AvailabilityGrid'
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

export function AvailabilityCalendar({ inventory: _inventory }: AvailabilityCalendarProps) {
  const today = new Date().toISOString().split('T')[0]
  const [selectedDate,  setSelectedDate]  = useState(today)
  const [packageType,   setPackageType]   = useState<PackageFilter>('all')
  const [result,        setResult]        = useState<AvailabilityResult[] | null>(null)
  const [loading,       setLoading]       = useState(false)
  const [error,         setError]         = useState<string | null>(null)
  const [downloading,   setDownloading]   = useState(false)

  async function check() {
    if (!selectedDate) return
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ date: selectedDate })
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
          <Button onClick={check} loading={loading} disabled={!selectedDate}>
            Check Availability
          </Button>
          <Button
            variant="outline"
            onClick={downloadAllocation}
            loading={downloading}
            disabled={!selectedDate}
          >
            <Download size={14} className="mr-1.5" />
            Download Room Allocation
          </Button>
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
