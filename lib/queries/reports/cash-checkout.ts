import { createClient } from '@/lib/supabase/server'
import { dhakaRangeBounds } from '@/lib/reports/booking-revenue'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createClient() as any

export interface CashCheckoutRow {
  id:             string
  /** Dhaka calendar date the cash was taken. */
  date:           string
  booking_number: string
  customer_name:  string
  amount:         number
}

export interface CashCheckoutReport {
  from:   string
  to:     string
  rows:   CashCheckoutRow[]
  total:  number
  /** Days with at least one cash payment — for a per-day cash-up. */
  byDate: Array<{ date: string; count: number; total: number }>
}

const DHAKA_DAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit', day: '2-digit',
})

/**
 * Cash taken at checkout — nothing else.
 *
 * Deliberately narrow: no advances (those are bKash and bank transfer), no
 * cards, no bank transfers, no coffee-shop tender. This is the figure that
 * should match the notes counted in the drawer, so anything that never passed
 * through the drawer would only make it harder to reconcile.
 *
 * `paid_at` is a timestamptz, so the range is converted to Dhaka bounds
 * first — filtering it as a bare UTC date puts a payment taken before 6am
 * local on the previous day and skews the whole month by six hours.
 */
export async function getCashCheckoutReport(
  fromIso: string,
  toIso:   string,
): Promise<CashCheckoutReport> {
  const { startUtc, endUtc } = dhakaRangeBounds(fromIso, toIso)

  const { data, error } = await db()
    .from('checkout_payments')
    .select(`
      id, amount, paid_at,
      checkout:checkouts (
        booking:bookings (booking_number, customer_name)
      )
    `)
    .eq('method', 'cash')
    .gte('paid_at', startUtc)
    .lt('paid_at', endUtc)
    .order('paid_at', { ascending: true })
    .limit(5000)
  if (error) throw new Error(`[cashCheckout] ${error.message}`)

  const rows: CashCheckoutRow[] = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const r of ((data ?? []) as any[])) {
    const co = Array.isArray(r.checkout) ? r.checkout[0] : r.checkout
    const b  = co && (Array.isArray(co.booking) ? co.booking[0] : co.booking)
    rows.push({
      id:             r.id,
      date:           DHAKA_DAY.format(new Date(r.paid_at)),
      booking_number: b?.booking_number ?? '—',
      customer_name:  b?.customer_name ?? '—',
      amount:         Number(r.amount ?? 0),
    })
  }

  const dayMap = new Map<string, { date: string; count: number; total: number }>()
  for (const r of rows) {
    const cur = dayMap.get(r.date) ?? { date: r.date, count: 0, total: 0 }
    cur.count += 1
    cur.total = Math.round((cur.total + r.amount) * 100) / 100
    dayMap.set(r.date, cur)
  }

  return {
    from: fromIso,
    to:   toIso,
    rows,
    total:  Math.round(rows.reduce((s, r) => s + r.amount, 0) * 100) / 100,
    byDate: [...dayMap.values()].sort((a, b) => a.date.localeCompare(b.date)),
  }
}
