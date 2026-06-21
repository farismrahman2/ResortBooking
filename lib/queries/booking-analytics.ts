import { createClient } from '@/lib/supabase/server'

/**
 * BOOKING ANALYTICS — keyed by created_at (when the booking/quote was placed),
 * not visit_date. Complementary to lib/queries/analytics.ts which is keyed by
 * visit_date for revenue/occupancy reporting.
 *
 * Use case: marketing campaign attribution + "what days do bookings spike, so
 * we know when to staff up for inquiries?"
 *
 * All day-buckets are computed against Asia/Dhaka calendar dates regardless
 * of server timezone — mirrors lib/coffee-shop/timezone.ts.
 */

const DHAKA_TZ = 'Asia/Dhaka'

const dhakaDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: DHAKA_TZ,
  year:  'numeric',
  month: '2-digit',
  day:   '2-digit',
})

/** Convert a UTC ISO timestamp to its Asia/Dhaka calendar date (YYYY-MM-DD). */
export function toDhakaDate(utcIso: string): string {
  return dhakaDateFormatter.format(new Date(utcIso))
}

/** Convert an inclusive Dhaka date range [from, to] into the half-open UTC
 *  range [fromUtc, toUtc) that contains all timestamps whose Dhaka date
 *  falls inside the range. Dhaka is fixed UTC+6 (no DST). */
export function dhakaDateToUtcBounds(
  from: string,
  to:   string,
): { fromUtc: string; toUtc: string } {
  const fromUtc = new Date(from + 'T00:00:00+06:00').toISOString()
  const toBoundary = new Date(to + 'T00:00:00+06:00')
  toBoundary.setUTCDate(toBoundary.getUTCDate() + 1)
  return { fromUtc, toUtc: toBoundary.toISOString() }
}

/** Whole-day delta between two YYYY-MM-DD strings (no DST adjustment). */
export function daysBetween(earlierDate: string, laterDate: string): number {
  const e = new Date(earlierDate + 'T00:00:00Z')
  const l = new Date(laterDate   + 'T00:00:00Z')
  return Math.round((l.getTime() - e.getTime()) / 86_400_000)
}

export const LEAD_TIME_BINS = [
  { bin: '0–2 days',   minDays: 0,  maxDays: 2 },
  { bin: '3–7 days',   minDays: 3,  maxDays: 7 },
  { bin: '8–14 days',  minDays: 8,  maxDays: 14 },
  { bin: '15–30 days', minDays: 15, maxDays: 30 },
  { bin: '31–60 days', minDays: 31, maxDays: 60 },
  { bin: '61+ days',   minDays: 61, maxDays: Infinity },
] as const

export function classifyLeadTime(days: number): typeof LEAD_TIME_BINS[number]['bin'] {
  for (const b of LEAD_TIME_BINS) {
    if (days >= b.minDays && days <= b.maxDays) return b.bin
  }
  return LEAD_TIME_BINS[LEAD_TIME_BINS.length - 1].bin
}

/** Enumerate every YYYY-MM-DD between from and to inclusive. */
export function eachDhakaDate(from: string, to: string): string[] {
  const dates: string[] = []
  const cursor = new Date(from + 'T00:00:00Z')
  const end    = new Date(to   + 'T00:00:00Z')
  while (cursor.getTime() <= end.getTime()) {
    dates.push(cursor.toISOString().slice(0, 10))
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return dates
}

const DOW_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BookingAnalyticsFilters {
  from: string                            // Dhaka YYYY-MM-DD
  to:   string                            // Dhaka YYYY-MM-DD, inclusive
  packageType?: 'all' | 'daylong' | 'night'
}

export interface BookingAnalyticsTotals {
  bookings_created: number
  quotes_created:   number
  /** Conversion rate as 0..1, or null when quotes_created is 0. */
  conversion_rate:  number | null
  revenue:          number
}

export interface DailyBookingsRow { date: string; count: number; revenue: number }
export interface DailyQuotesRow   { date: string; count: number }
export interface DowRow           { dow: number; label: string; count: number }
export interface LeadTimeRow      { bin: string; count: number }
export interface SalesRepRow      { rep_id: string; rep_name: string; bookings: number; revenue: number }

export interface CorporateBucket { bookings: number; revenue: number }
export interface CorporateBreakdown {
  corporate: CorporateBucket
  retail:    CorporateBucket
}

export interface BookingAnalyticsData {
  totals:        BookingAnalyticsTotals
  bookingsDaily: DailyBookingsRow[]
  quotesDaily:   DailyQuotesRow[]
  dowBreakdown:  DowRow[]
  leadTimeBins:  LeadTimeRow[]
  salesReps:     SalesRepRow[]
  corporateBreakdown: CorporateBreakdown
}

// ─── Query ────────────────────────────────────────────────────────────────────

export async function getBookingAnalytics(
  filters: BookingAnalyticsFilters,
): Promise<BookingAnalyticsData> {
  const { from, to, packageType = 'all' } = filters
  const { fromUtc, toUtc } = dhakaDateToUtcBounds(from, to)
  const supabase = createClient()

  let bookingsQ = supabase
    .from('bookings')
    .select('id, created_at, visit_date, total, package_type, sales_employee_id, is_corporate, status')
    .gte('created_at', fromUtc)
    .lt('created_at',  toUtc)
    .neq('status', 'cancelled')
  if (packageType !== 'all') bookingsQ = bookingsQ.eq('package_type', packageType)

  let quotesQ = supabase
    .from('quotes')
    .select('id, created_at, package_type, status')
    .gte('created_at', fromUtc)
    .lt('created_at',  toUtc)
    .neq('status', 'cancelled')
  if (packageType !== 'all') quotesQ = quotesQ.eq('package_type', packageType)

  const [bookingsRes, quotesRes] = await Promise.all([bookingsQ, quotesQ])
  if (bookingsRes.error) throw new Error(`getBookingAnalytics(bookings): ${bookingsRes.error.message}`)
  if (quotesRes.error)   throw new Error(`getBookingAnalytics(quotes): ${quotesRes.error.message}`)

  const bookings = (bookingsRes.data ?? []) as Array<{
    id:                string
    created_at:        string
    visit_date:        string | null
    total:             number | null
    package_type:      string
    sales_employee_id: string | null
    is_corporate?:     boolean | null
  }>
  const quotes = (quotesRes.data ?? []) as Array<{ id: string; created_at: string }>

  // Fetch sales rep names for the IDs actually referenced
  const repIds = Array.from(
    new Set(bookings.map((b) => b.sales_employee_id).filter(Boolean) as string[]),
  )
  const repNames = new Map<string, string>()
  if (repIds.length > 0) {
    const { data: employees } = await supabase
      .from('employees')
      .select('id, full_name')
      .in('id', repIds)
    for (const e of (employees ?? []) as Array<{ id: string; full_name: string }>) {
      repNames.set(e.id, e.full_name)
    }
  }

  // Zero-filled aggregation buckets
  const allDates       = eachDhakaDate(from, to)
  const bookingsByDate = new Map(allDates.map((d) => [d, { count: 0, revenue: 0 }]))
  const quotesByDate   = new Map(allDates.map((d) => [d, { count: 0 }]))
  const dowCounts      = new Array(7).fill(0) as number[]
  const leadTimeCounts = new Map<string, number>(LEAD_TIME_BINS.map((b) => [b.bin, 0]))
  const repAgg         = new Map<string, { bookings: number; revenue: number }>()
  const corporateBucket: CorporateBucket = { bookings: 0, revenue: 0 }
  const retailBucket:    CorporateBucket = { bookings: 0, revenue: 0 }
  let revenueTotal     = 0

  for (const b of bookings) {
    const dhakaDate = toDhakaDate(b.created_at)
    const rev       = Number(b.total ?? 0)
    revenueTotal   += rev

    const bucket = b.is_corporate ? corporateBucket : retailBucket
    bucket.bookings += 1
    bucket.revenue  += rev

    const row = bookingsByDate.get(dhakaDate)
    if (row) { row.count += 1; row.revenue += rev }

    const dow = new Date(dhakaDate + 'T00:00:00Z').getUTCDay()
    dowCounts[dow] += 1

    if (b.visit_date) {
      const lead = daysBetween(dhakaDate, b.visit_date)
      if (lead >= 0) {
        const bin = classifyLeadTime(lead)
        leadTimeCounts.set(bin, (leadTimeCounts.get(bin) ?? 0) + 1)
      }
    }

    if (b.sales_employee_id) {
      const r = repAgg.get(b.sales_employee_id) ?? { bookings: 0, revenue: 0 }
      r.bookings += 1
      r.revenue  += rev
      repAgg.set(b.sales_employee_id, r)
    }
  }

  for (const q of quotes) {
    const dhakaDate = toDhakaDate(q.created_at)
    const row = quotesByDate.get(dhakaDate)
    if (row) row.count += 1
  }

  const bookingsCount = bookings.length
  const quotesCount   = quotes.length

  return {
    totals: {
      bookings_created: bookingsCount,
      quotes_created:   quotesCount,
      conversion_rate:  quotesCount > 0 ? bookingsCount / quotesCount : null,
      revenue:          revenueTotal,
    },
    bookingsDaily: allDates.map((d) => {
      const v = bookingsByDate.get(d)!
      return { date: d, count: v.count, revenue: v.revenue }
    }),
    quotesDaily: allDates.map((d) => ({ date: d, count: quotesByDate.get(d)!.count })),
    dowBreakdown: dowCounts.map((count, dow) => ({ dow, label: DOW_LABELS[dow], count })),
    leadTimeBins: LEAD_TIME_BINS.map((b) => ({ bin: b.bin, count: leadTimeCounts.get(b.bin) ?? 0 })),
    salesReps: Array.from(repAgg.entries())
      .map(([rep_id, v]) => ({
        rep_id,
        rep_name: repNames.get(rep_id) ?? '(unknown)',
        bookings: v.bookings,
        revenue:  v.revenue,
      }))
      .sort((a, b) => b.bookings - a.bookings || b.revenue - a.revenue),
    corporateBreakdown: {
      corporate: corporateBucket,
      retail:    retailBucket,
    },
  }
}
