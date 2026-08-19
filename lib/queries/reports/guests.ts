import { createServiceClient } from '@/lib/supabase/server'
import { toIsoDate } from '@/lib/reports/periods'
import { getComparisonRange } from '@/lib/reports/periods'
import type { PeriodRange } from '@/lib/reports/types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createServiceClient() as any

export interface GuestTotals {
  bookings:         number
  adults:           number
  children_paid:    number
  children_free:    number
  drivers:          number
  /** adults + children (paid + free). Drivers counted separately. */
  guests:           number
  daylong_bookings: number
  night_bookings:   number
  daylong_guests:   number
  night_guests:     number
}

export interface GuestDayRow {
  date:     string
  bookings: number
  adults:   number
  children: number
  drivers:  number
  guests:   number
}

export interface GuestReport {
  totals: GuestTotals
  daily:  GuestDayRow[]
}

const emptyTotals = (): GuestTotals => ({
  bookings: 0, adults: 0, children_paid: 0, children_free: 0, drivers: 0,
  guests: 0, daylong_bookings: 0, night_bookings: 0, daylong_guests: 0, night_guests: 0,
})

/**
 * Guest numbers by ARRIVAL date — how many people the resort served, counted
 * on the day each booking starts. Cancelled and no-show bookings are excluded:
 * neither put a guest on the grounds. Booked counts, not checkout-adjusted.
 */
export async function getGuestReport(period: PeriodRange): Promise<GuestReport> {
  const fromIso = toIsoDate(period.from)
  const toIso   = toIsoDate(period.to)

  const { data, error } = await db()
    .from('bookings')
    .select('visit_date, package_type, adults, children_paid, children_free, drivers')
    .gte('visit_date', fromIso)
    .lte('visit_date', toIso)
    .not('status', 'in', '(cancelled,no_show)')
    .limit(10_000)
  // Throw — a failed query must error the page, not render zero guests.
  if (error) throw new Error(`[reports.guests] ${error.message}`)

  const totals = emptyTotals()
  const byDay = new Map<string, GuestDayRow>()
  // Zero-fill so quiet days show as 0 instead of vanishing from the table.
  let d = new Date(period.from)
  while (d <= period.to) {
    const iso = toIsoDate(d)
    byDay.set(iso, { date: iso, bookings: 0, adults: 0, children: 0, drivers: 0, guests: 0 })
    d = new Date(d.getTime() + 86400_000)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const b of ((data ?? []) as any[])) {
    const adults   = Number(b.adults ?? 0)
    const cPaid    = Number(b.children_paid ?? 0)
    const cFree    = Number(b.children_free ?? 0)
    const drivers  = Number(b.drivers ?? 0)
    const guests   = adults + cPaid + cFree

    totals.bookings      += 1
    totals.adults        += adults
    totals.children_paid += cPaid
    totals.children_free += cFree
    totals.drivers       += drivers
    totals.guests        += guests
    if (b.package_type === 'daylong') {
      totals.daylong_bookings += 1
      totals.daylong_guests   += guests
    } else {
      totals.night_bookings += 1
      totals.night_guests   += guests
    }

    const row = byDay.get(b.visit_date)
    if (!row) continue
    row.bookings += 1
    row.adults   += adults
    row.children += cPaid + cFree
    row.drivers  += drivers
    row.guests   += guests
  }

  return { totals, daily: [...byDay.values()] }
}

/** Totals for the comparison period (previous period / same period last year). */
export async function getGuestTotalsForComparison(
  period: PeriodRange, mode: 'previous_period' | 'year_over_year',
): Promise<GuestTotals> {
  const range = getComparisonRange(period, mode)
  const { totals } = await getGuestReport(range)
  return totals
}
