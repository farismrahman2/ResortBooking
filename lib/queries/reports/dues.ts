import { createClient } from '@/lib/supabase/server'
import { calcChargesTotal, calcNetDue } from '@/lib/checkout/totals'
import { todayDhaka } from '@/lib/dates'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createClient() as any

export interface DueRow {
  booking_id:     string
  booking_number: string
  customer_name:  string
  customer_phone: string
  is_corporate:   boolean
  company_name:   string | null
  /** Stay dates, for context when calling the guest. */
  visit_date:     string
  check_out_date: string | null
  /** The day the balance became collectable — checkout day, or the visit day
   *  for a daylong. */
  due_since:      string
  days_overdue:   number
  total_bill:     number   // booking + extras − discount
  collected:      number   // advance instalments + checkout payments
  outstanding:    number
  checkout_status: string | null
}

export interface DuesBucket { label: string; from: number; to: number | null; count: number; total: number }

export interface DuesReport {
  asOf:        string
  minDays:     number
  rows:        DueRow[]     // already filtered to >= minDays, worst first
  allRows:     DueRow[]     // every overdue booking, for the bucket summary
  totalOverdue: number      // value of `rows`
  buckets:     DuesBucket[]
}

const BUCKETS: Array<{ label: string; from: number; to: number | null }> = [
  { label: '1–5 days',   from: 1,  to: 5 },
  { label: '6–15 days',  from: 6,  to: 15 },
  { label: '16–30 days', from: 16, to: 30 },
  { label: '31–60 days', from: 31, to: 60 },
  { label: 'Over 60 days', from: 61, to: null },
]

const daysBetween = (fromIso: string, toIso: string): number =>
  Math.round(
    (new Date(`${toIso}T12:00:00Z`).getTime() - new Date(`${fromIso}T12:00:00Z`).getTime()) / 86400_000,
  )

/**
 * Money the resort is still owed by guests who have already left.
 *
 * Aged from the day the balance became collectable — the checkout date, or
 * the visit date for a daylong. A future booking with a balance is not a due:
 * nothing is late until the guest has been and gone.
 *
 * The outstanding figure matches what the checkout screen shows the operator
 * (booking total + extras − discount − advance − payments), NOT the simpler
 * analytics figure, because whoever chases this will open that screen to act
 * on it and the two must agree. Cancelled and no-show bookings are excluded —
 * their balances are not collectable.
 */
export async function getOutstandingDues(minDays = 6): Promise<DuesReport> {
  const asOf = todayDhaka()

  const { data, error } = await db()
    .from('bookings')
    .select(`
      id, booking_number, customer_name, customer_phone, package_type,
      visit_date, check_out_date, total, advance_paid, status,
      is_corporate, company_name,
      checkout:checkouts (
        status, discount_amount,
        charges:checkout_charges (amount, quantity, unit_price),
        payments:checkout_payments (amount)
      )
    `)
    .in('status', ['confirmed', 'checked_out'])
    .lte('visit_date', asOf)
    .limit(5000)
  if (error) throw new Error(`[dues] ${error.message}`)

  const allRows: DueRow[] = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const b of ((data ?? []) as any[])) {
    // A daylong's own visit day is its checkout day.
    const dueSince = b.check_out_date ?? b.visit_date
    const daysOverdue = daysBetween(dueSince, asOf)
    if (daysOverdue < 1) continue    // still staying, or left today — not late

    const co = Array.isArray(b.checkout) ? b.checkout[0] : b.checkout
    const chargesTotal  = co ? calcChargesTotal((co.charges ?? []) as any[]) : 0
    const discount      = co ? Number(co.discount_amount ?? 0) : 0
    const coPayments    = co
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? ((co.payments ?? []) as any[]).reduce((s, p) => s + Number(p.amount ?? 0), 0)
      : 0
    const advance   = Number(b.advance_paid ?? 0)
    const totalBill = Math.round((Number(b.total ?? 0) + chargesTotal - discount) * 100) / 100
    const collected = Math.round((advance + coPayments) * 100) / 100
    // Same helper the checkout screen uses, so the two figures can never drift.
    const outstanding = calcNetDue({
      bookingTotal:   Number(b.total ?? 0),
      chargesTotal,
      advance,
      paymentsTotal:  coPayments,
      discountAmount: discount,
    })

    // A paisa of float noise is not a debt.
    if (outstanding <= 0.5) continue

    allRows.push({
      booking_id:     b.id,
      booking_number: b.booking_number,
      customer_name:  b.customer_name,
      customer_phone: b.customer_phone,
      is_corporate:   Boolean(b.is_corporate),
      company_name:   b.company_name ?? null,
      visit_date:     b.visit_date,
      check_out_date: b.check_out_date ?? null,
      due_since:      dueSince,
      days_overdue:   daysOverdue,
      total_bill:     totalBill,
      collected,
      outstanding,
      checkout_status: co?.status ?? null,
    })
  }

  // Oldest and largest first — that is the order anyone should work them in.
  allRows.sort((a, b) =>
    b.days_overdue - a.days_overdue || b.outstanding - a.outstanding)

  const rows = allRows.filter((r) => r.days_overdue >= minDays)

  const buckets: DuesBucket[] = BUCKETS.map((b) => {
    const inBucket = allRows.filter((r) =>
      r.days_overdue >= b.from && (b.to === null || r.days_overdue <= b.to))
    return {
      ...b,
      count: inBucket.length,
      total: Math.round(inBucket.reduce((s, r) => s + r.outstanding, 0) * 100) / 100,
    }
  })

  return {
    asOf, minDays, rows, allRows,
    totalOverdue: Math.round(rows.reduce((s, r) => s + r.outstanding, 0) * 100) / 100,
    buckets,
  }
}
