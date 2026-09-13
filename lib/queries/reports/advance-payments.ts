import { createClient } from '@/lib/supabase/server'
import { isMissingRelation } from '@/lib/supabase/errors'
import { dhakaRangeBounds } from '@/lib/reports/booking-revenue'
import { ADVANCE_METHODS, ADVANCE_METHOD_LABEL, type AdvanceMethod } from '@/lib/bookings/advance-methods'
import type { BookingStatus, PackageType } from '@/lib/supabase/types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createClient() as any

export interface AdvanceReportRow {
  id:             string
  /** Dhaka calendar date the money arrived. */
  date:           string
  paid_at:        string
  customer_name:  string
  company_name:   string | null
  booking_number: string
  visit_date:     string | null
  package_type:   PackageType | null
  amount:         number
  method:         AdvanceMethod
  method_label:   string
  reference:      string | null
  /** Flagged in the report — the money came in but the stay did not happen. */
  status:         BookingStatus | null
}

export interface MethodTotal {
  method: AdvanceMethod
  label:  string
  amount: number
  count:  number
}

export interface AdvanceDay {
  date:     string
  rows:     AdvanceReportRow[]
  total:    number
  byMethod: MethodTotal[]
}

export interface AdvancePaymentsReport {
  from:     string
  to:       string
  days:     AdvanceDay[]
  rows:     AdvanceReportRow[]
  total:    number
  count:    number
  byMethod: MethodTotal[]
  /** Advances against bookings later cancelled or marked no-show. */
  voidTotal: number
}

const DHAKA_DAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit', day: '2-digit',
})

const methodOrder = (m: AdvanceMethod) => {
  const i = ADVANCE_METHODS.indexOf(m)
  return i === -1 ? ADVANCE_METHODS.length : i
}

function rollUp(rows: AdvanceReportRow[]): MethodTotal[] {
  const map = new Map<AdvanceMethod, MethodTotal>()
  for (const r of rows) {
    const cur = map.get(r.method) ?? { method: r.method, label: r.method_label, amount: 0, count: 0 }
    cur.amount = Math.round((cur.amount + r.amount) * 100) / 100
    cur.count += 1
    map.set(r.method, cur)
  }
  return [...map.values()].sort((a, b) => methodOrder(a.method) - methodOrder(b.method))
}

/**
 * Advance money received in a date range, day by day.
 *
 * Keyed on when the money ARRIVED (`paid_at`), not on when the booking was
 * made or when the guest visits — this is the sheet that reconciles against
 * the bKash statement and the bank statement for those dates. A guest who
 * pays in two instalments appears twice, on the two days they paid.
 *
 * `paid_at` is a timestamptz, so the range is converted to Dhaka bounds
 * first: filtering on the bare date drops anything taken after 6am on the
 * last day and pulls in the small hours of the day before.
 */
export async function getAdvancePaymentsReport(
  fromIso: string,
  toIso:   string,
): Promise<AdvancePaymentsReport> {
  const { startUtc, endUtc } = dhakaRangeBounds(fromIso, toIso)

  const { data, error } = await db()
    .from('booking_advance_payments')
    .select(`
      id, amount, method, paid_at, reference,
      booking:bookings (
        booking_number, customer_name, company_name, visit_date, package_type, status
      )
    `)
    .gte('paid_at', startUtc)
    .lt('paid_at', endUtc)
    .order('paid_at', { ascending: true })
    .limit(5000)

  // The instalment ledger arrived with a migration — an absent table means
  // "nothing recorded yet", not a broken report.
  if (error && isMissingRelation(error)) {
    return { from: fromIso, to: toIso, days: [], rows: [], total: 0, count: 0, byMethod: [], voidTotal: 0 }
  }
  if (error) throw new Error(`[advancePayments] ${error.message}`)

  const rows: AdvanceReportRow[] = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const r of ((data ?? []) as any[])) {
    const b = Array.isArray(r.booking) ? r.booking[0] : r.booking
    const method = (r.method ?? 'other') as AdvanceMethod
    rows.push({
      id:             r.id,
      date:           DHAKA_DAY.format(new Date(r.paid_at)),
      paid_at:        r.paid_at,
      customer_name:  (b?.customer_name ?? '—').trim() || '—',
      company_name:   b?.company_name ?? null,
      booking_number: b?.booking_number ?? '—',
      visit_date:     b?.visit_date ?? null,
      package_type:   (b?.package_type ?? null) as PackageType | null,
      amount:         Number(r.amount ?? 0),
      method,
      method_label:   ADVANCE_METHOD_LABEL[method] ?? method,
      reference:      r.reference ?? null,
      status:         (b?.status ?? null) as BookingStatus | null,
    })
  }

  const dayMap = new Map<string, AdvanceReportRow[]>()
  for (const r of rows) {
    const list = dayMap.get(r.date) ?? []
    list.push(r)
    dayMap.set(r.date, list)
  }

  const days: AdvanceDay[] = [...dayMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, dayRows]) => ({
      date,
      rows:     dayRows,
      total:    Math.round(dayRows.reduce((s, r) => s + r.amount, 0) * 100) / 100,
      byMethod: rollUp(dayRows),
    }))

  const voidRows = rows.filter((r) => r.status === 'cancelled' || r.status === 'no_show')

  return {
    from: fromIso,
    to:   toIso,
    days,
    rows,
    total:     Math.round(rows.reduce((s, r) => s + r.amount, 0) * 100) / 100,
    count:     rows.length,
    byMethod:  rollUp(rows),
    voidTotal: Math.round(voidRows.reduce((s, r) => s + r.amount, 0) * 100) / 100,
  }
}
