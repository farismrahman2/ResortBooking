'use client'

import { useEffect } from 'react'
import type { DailyReportRow, FreeRooms } from '@/lib/queries/daily-report'
import {
  DICT,
  formatLongDate,
  fmtNum,
  packageLabel,
  roomTypeLabel,
  type Lang,
} from '@/lib/i18n/daily-report'

interface Props {
  date: string
  lang: Lang
  rows: DailyReportRow[]
  free: FreeRooms
}

export function DailyReportPrint({ date, lang, rows, free }: Props) {
  const t = DICT[lang]

  // Auto-fire the print dialog once on mount. Small delay so fonts have a
  // chance to load — Bangla rendering can lay out wrong if Noto Sans Bengali
  // is still being fetched when print() runs.
  useEffect(() => {
    const id = window.setTimeout(() => window.print(), 350)
    return () => window.clearTimeout(id)
  }, [])

  // Pure night-stay checkouts are excluded from the main listing — they
  // leave by noon, so they belong in `free_after_12pm` not in the meal-
  // serving listing. Matches the convention in the user's reference image.
  const listing = rows.filter((r) => !(r.is_checkout && r.package_type === 'night'))

  // Rooms vacated by a pure night-stay checkout this morning — used to
  // flag a same-day daylong arrival into one of those rooms (back-to-back
  // handover, so the daylong guest gets the room only after noon).
  const nightCheckoutRooms = new Set<string>()
  for (const r of rows) {
    if (r.is_checkout && r.package_type === 'night') {
      for (const room of r.rooms) for (const num of room.room_numbers) nightCheckoutRooms.add(num)
    }
  }
  function isHandover(row: typeof rows[number]): boolean {
    if (row.package_type !== 'daylong') return false
    for (const room of row.rooms) for (const num of room.room_numbers) {
      if (nightCheckoutRooms.has(num)) return true
    }
    return false
  }

  const totals = listing.reduce(
    (acc, r) => ({
      adults:   acc.adults   + r.adults,
      children: acc.children + r.children_paid + r.children_free,
      drivers:  acc.drivers  + r.drivers,
    }),
    { adults: 0, children: 0, drivers: 0 },
  )
  const totalPeople = totals.adults + totals.children + totals.drivers

  return (
    <div className="mx-auto max-w-5xl px-6 py-8 text-gray-900">
      {/* Print-only CSS: A4 margins + hide the toolbar */}
      <style>{`
        @page { size: A4; margin: 12mm; }
        @media print {
          .no-print { display: none !important; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
        .rep-table { border-collapse: collapse; width: 100%; font-size: 12px; }
        .rep-table th, .rep-table td { border: 1px solid #9ca3af; padding: 8px; vertical-align: middle; }
        .rep-table th { background: #dbeafe; font-weight: 600; text-align: center; }
        .rep-table td.center { text-align: center; }
        .rep-row-free { background: #dbeafe; font-weight: 500; }
        .rep-row-total { background: #dbeafe; font-weight: 600; }
        .rep-row-handover { background: #fef3c7; }
        .rep-phone { font-family: monospace; font-size: 9px; color: #6b7280; margin-top: 1px; }
      `}</style>

      {/* Toolbar (not printed) */}
      <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
        <p className="text-sm text-gray-700">{t.print_hint}</p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-700"
          >
            {t.download}
          </button>
        </div>
      </div>

      {/* Header */}
      <div className="mb-4 text-center">
        <h1 className="text-xl font-bold">{formatLongDate(date, lang)}</h1>
        <p className="mt-1 text-base font-semibold">{t.title}</p>
      </div>

      {/* Table */}
      <table className="rep-table">
        <thead>
          <tr>
            <th>{t.col_name}</th>
            <th>{t.col_package}</th>
            <th>{t.col_guests}</th>
            <th>{t.col_meals}</th>
            <th>{t.col_rooms}</th>
          </tr>
        </thead>
        <tbody>
          {listing.map((row) => (
            <tr key={row.booking_number} className={isHandover(row) ? 'rep-row-handover' : ''}>
              <td>
                <div>{row.customer_name}</div>
                {row.customer_phone && (
                  <div className="rep-phone">{fmtNum(row.customer_phone, lang)}</div>
                )}
              </td>
              <td className="center">{packageLabel(row.package_type, lang)}</td>
              <td className="center">{renderGuests(row, lang, t)}</td>
              <td className="center">{renderMeals(row, t)}</td>
              <td className="center">{renderRooms(row, lang)}</td>
            </tr>
          ))}

          {/* Free rooms — single row spanning the package/guests/meals columns */}
          <tr className="rep-row-free">
            <td className="center">{t.free_rooms}</td>
            <td colSpan={3} className="center">
              {renderFreeRooms(free, lang, t)}
            </td>
            <td />
          </tr>

          {/* Totals */}
          <tr className="rep-row-total">
            <td />
            <td className="center">{t.total}</td>
            <td colSpan={3} className="center">
              {renderTotals(totalPeople, totals, lang, t)}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

function renderGuests(row: DailyReportRow, lang: Lang, t: typeof DICT['en']) {
  const lines: string[] = []
  // Drivers — when present we show adults excluding drivers like "22 জন / ড্রাইভার 3 জন"
  if (row.drivers > 0) {
    lines.push(`${fmtNum(row.adults, lang)} ${t.adults_short}`)
    lines.push(`${t.drivers} ${fmtNum(row.drivers, lang)} ${t.adults_short}`)
  } else {
    lines.push(`${fmtNum(row.adults, lang)} ${t.adults_short}`)
  }
  const children = row.children_paid + row.children_free
  if (children > 0) lines.push(`${t.children} ${fmtNum(children, lang)} ${t.adults_short}`)
  return (
    <div className="leading-tight">
      {lines.map((l, i) => <div key={i}>{l}</div>)}
    </div>
  )
}

function renderMeals(row: DailyReportRow, t: typeof DICT['en']) {
  const parts: string[] = []
  if (row.meals.breakfast > 0) parts.push(t.meal_breakfast)
  if (row.meals.lunch     > 0) parts.push(t.meal_lunch)
  if (row.meals.snacks    > 0) parts.push(t.meal_snacks)
  if (row.meals.dinner    > 0) parts.push(t.meal_dinner)
  if (parts.length === 0) return '—'
  return parts.join(', ')
}

function renderRooms(row: DailyReportRow, lang: Lang) {
  const labels: string[] = []
  for (const r of row.rooms) {
    if (r.room_numbers.length > 0) {
      labels.push(r.room_numbers.map((n) => fmtNum(n, lang)).join(', '))
    } else {
      // No assigned number — show room type as fallback
      labels.push(`${roomTypeLabel(r.room_type, r.room_type.replace(/_/g, ' '), lang)} × ${fmtNum(r.qty, lang)}`)
    }
  }
  return labels.join(', ') || '—'
}

function renderFreeRooms(free: FreeRooms, lang: Lang, t: typeof DICT['en']) {
  const lines: string[] = []
  if (free.free_all_day.length > 0) {
    lines.push(free.free_all_day.map((n) => fmtNum(n, lang)).join(', '))
  }
  if (free.free_after_12pm.length > 0) {
    lines.push(`${t.after_noon} ${free.free_after_12pm.map((n) => fmtNum(n, lang)).join(', ')}`)
  }
  if (free.free_after_6pm.length > 0) {
    lines.push(`${t.after_6pm} ${free.free_after_6pm.map((n) => fmtNum(n, lang)).join(', ')}`)
  }
  if (lines.length === 0) return '—'
  return (
    <div className="leading-relaxed">
      {lines.map((l, i) => <div key={i}>{l}</div>)}
    </div>
  )
}

function renderTotals(
  totalPeople: number,
  totals: { adults: number; children: number; drivers: number },
  lang: Lang,
  t: typeof DICT['en'],
) {
  const parts: string[] = [`${fmtNum(totalPeople, lang)} ${t.adults_short}`]
  parts.push(`${t.adults_label} ${fmtNum(totals.adults, lang)} ${t.adults_short}`)
  if (totals.children > 0) parts.push(`${t.children} ${fmtNum(totals.children, lang)} ${t.adults_short}`)
  if (totals.drivers  > 0) parts.push(`${t.drivers} ${fmtNum(totals.drivers, lang)} ${t.adults_short}`)
  return parts.join(', ') + (lang === 'bn' ? '।' : '.')
}
