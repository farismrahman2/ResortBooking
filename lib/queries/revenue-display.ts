import { unstable_cache } from 'next/cache'
import { createServiceClient } from '@/lib/supabase/server'
import { isMissingRelation } from '@/lib/supabase/errors'
import { REVENUE_STATUS_LIST, bookingRevenue } from '@/lib/reports/booking-revenue'
import { addDaysIso } from '@/lib/dates'
import { adjust, monthStart, pctForMonth, type DisplayRule } from '@/lib/revenue/display'

/**
 * Server only. The real figures here must never reach a non-admin's browser:
 * pages pass staff the ADJUSTED numbers only (getDisplayedRevenue).
 */

const db = () => createServiceClient() as any   // eslint-disable-line @typescript-eslint/no-explicit-any

export async function listDisplayRules(): Promise<{ rules: DisplayRule[]; missing: boolean }> {
  const { data, error } = await db().from('revenue_display_rules').select('month, pct').order('month', { ascending: true })
  if (error) return { rules: [], missing: isMissingRelation(error) }
  return { rules: ((data ?? []) as Array<{ month: string; pct: number | string }>).map((r) => ({ month: r.month, pct: Number(r.pct) })), missing: false }
}

const monthEnd = (start: string) => addDaysIso(nextMonth(start), -1)
function nextMonth(start: string): string {
  const [y, m] = start.split('-').map(Number)
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`
}

/** Real room-booking revenue for a month, by stay (visit) date. */
export async function realMonthRevenue(month: string): Promise<{ total: number; bookings: number; daily: Record<string, number> }> {
  const from = monthStart(month), to = monthEnd(from)
  const daily: Record<string, number> = {}
  let total = 0, bookings = 0
  for (let page = 0; ; page++) {
    const { data, error } = await db().from('bookings')
      .select('visit_date, total, advance_paid, status')
      .gte('visit_date', from).lte('visit_date', to)
      .in('status', REVENUE_STATUS_LIST)
      .order('id', { ascending: true })
      .range(page * 1000, page * 1000 + 999)
    if (error) throw new Error(`realMonthRevenue: ${error.message}`)
    const rows = (data ?? []) as Array<{ visit_date: string; total: number; advance_paid: number; status: string }>
    for (const r of rows) {
      const v = bookingRevenue(r)
      total += v; bookings += 1
      daily[r.visit_date] = (daily[r.visit_date] ?? 0) + v
    }
    if (rows.length < 1000) break
  }
  return { total, bookings, daily }
}

export interface DisplayedRevenue {
  month:    string            // 'YYYY-MM-01'
  total:    number            // adjusted
  bookings: number
  daily:    Array<{ date: string; amount: number }>   // adjusted, every day of the month
}

/** What staff see for a month — already adjusted. Cached a minute; cleared by money saves. */
export const getDisplayedRevenue = (month: string) => unstable_cache(
  async (): Promise<DisplayedRevenue> => {
    const m = monthStart(month)
    const [{ rules }, real] = await Promise.all([listDisplayRules(), realMonthRevenue(m)])
    const pct = pctForMonth(rules, m)
    const daily: DisplayedRevenue['daily'] = []
    for (let d = m, end = monthEnd(m); d <= end; d = addDaysIso(d, 1)) {
      daily.push({ date: d, amount: adjust(real.daily[d] ?? 0, pct) })
    }
    return { month: m, total: adjust(real.total, pct), bookings: real.bookings, daily }
  },
  ['revenue-display', month.slice(0, 7)],
  { revalidate: 60, tags: ['reports', 'revenue-display'] },
)()
