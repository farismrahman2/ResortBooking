/**
 * The single definition of "how much revenue did this booking produce".
 *
 * This rule is stated explicitly in migrations/checkout-module/003_no_show.sql
 * and implemented by the get_booking_stats() SQL function:
 *
 *   For a no-show: revenue contribution = advance_paid (the non-refundable
 *   amount the guest actually paid), NOT the full booking total.
 *   For cancelled: excluded entirely (advances are refunded).
 *
 * The report queries used to just do `.neq('status','cancelled')` and sum
 * `total`, which counted a no-show at full value. That made the dashboard
 * (which calls get_booking_stats) and the reports disagree, and overstated
 * room revenue, ADR, RevPAR and net P&L.
 *
 * Anything summing booking money must go through here.
 */

/** Statuses that represent real, recognisable business. */
export const REVENUE_STATUSES = ['confirmed', 'checked_out', 'no_show'] as const

/** PostgREST filter value for `.in('status', …)`. */
export const REVENUE_STATUS_LIST = [...REVENUE_STATUSES] as string[]

export interface BookingRevenueRow {
  status?:        string | null
  total?:         number | null
  advance_paid?:  number | null
}

/** Revenue a single booking contributes. Cancelled and unaccepted → 0. */
export function bookingRevenue(b: BookingRevenueRow): number {
  const status = b.status ?? ''
  if (status === 'no_show') return Number(b.advance_paid ?? 0)
  if (status === 'confirmed' || status === 'checked_out') return Number(b.total ?? 0)
  // draft / sent / cancelled contribute nothing — a quote isn't revenue and a
  // cancellation is refunded.
  return 0
}

/** Sum helper for the common `rows.reduce(...)` shape. */
export function sumBookingRevenue(rows: BookingRevenueRow[]): number {
  return rows.reduce((s, b) => s + bookingRevenue(b), 0)
}

/**
 * Does this booking occupy a room on its dates?
 *
 * A no-show frees the room for resale — migrations/checkout-module/003_no_show
 * says "Availability treats it like cancelled" — so it must NOT count towards
 * occupancy even though it does contribute advance revenue. That asymmetry is
 * the whole reason this is a separate predicate.
 */
export function occupiesRoom(status: string | null | undefined): boolean {
  return status === 'confirmed' || status === 'checked_out'
}

// ─── Dhaka-correct timestamptz bounds ────────────────────────────────────────

const DHAKA_OFFSET = '+06:00'

/**
 * Inclusive-start / exclusive-end bounds for filtering a TIMESTAMPTZ column
 * by DHAKA calendar dates.
 *
 * `checkouts.finalized_at` is timestamptz but was being filtered as a bare
 * UTC date (`.gte(from).lte(to + 'T23:59:59')`). Dhaka is UTC+6, so a checkout
 * finalized between midnight and 06:00 local fell into the PREVIOUS UTC day —
 * the whole window was skewed six hours, dropping the first morning of the
 * range and pulling in the morning after it. The old upper bound also missed
 * anything in the final second of the day.
 */
export function dhakaRangeBounds(fromIso: string, toIso: string): { startUtc: string; endUtc: string } {
  const start = new Date(`${fromIso}T00:00:00${DHAKA_OFFSET}`)
  // Half-open: strictly less than the start of the day AFTER `to`.
  const endExclusive = new Date(`${toIso}T00:00:00${DHAKA_OFFSET}`)
  endExclusive.setUTCDate(endExclusive.getUTCDate() + 1)
  return { startUtc: start.toISOString(), endUtc: endExclusive.toISOString() }
}

/** Dhaka calendar date (YYYY-MM-DD) for a timestamptz value. */
export function toDhakaDay(ts: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(ts))
}
