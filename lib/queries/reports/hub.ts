import { createServiceClient } from '@/lib/supabase/server'
import { unstable_cache } from 'next/cache'
import { toIsoDate, periodLengthDays, getComparisonRange } from '@/lib/reports/periods'
import type { PeriodRange } from '@/lib/reports/types'

/**
 * Hub-level KPIs and 30-day sparklines. All numbers are rounded BDT.
 * Cached for 60s — comparison-heavy hub queries get hammered when admin
 * opens multiple reports.
 */

export interface HubTotals {
  total_revenue:  number
  room_revenue:   number
  extras_revenue: number
  booking_count:  number
  total_expenses: number
  net:            number
  // occupancy is daily averaged across the period
  avg_occupancy_pct: number | null
  total_rooms:       number | null
}

interface MonthlyIncomeRow  { month: string; room_revenue: number; extras_revenue: number; total_revenue: number; booking_count: number }
interface MonthlyExpenseRow { month: string; total_expenses: number; expense_count: number }
interface DailyOccupancyRow { date: string;  rooms_occupied: number; total_rooms: number; occupancy_pct: number | null }

async function fetchHubTotalsRaw(period: PeriodRange): Promise<HubTotals> {
  const db = createServiceClient() as any  // eslint-disable-line @typescript-eslint/no-explicit-any
  const fromIso = toIsoDate(period.from)
  const toIso   = toIsoDate(period.to)

  const [{ data: incomeRows }, { data: expenseRows }, { data: occRows }] = await Promise.all([
    db.rpc('reports_monthly_income',   { p_from: fromIso, p_to: toIso }),
    db.rpc('reports_monthly_expenses', { p_from: fromIso, p_to: toIso }),
    db.rpc('reports_daily_occupancy',  { p_from: fromIso, p_to: toIso }),
  ])

  const income  = (incomeRows  ?? []) as MonthlyIncomeRow[]
  const expense = (expenseRows ?? []) as MonthlyExpenseRow[]
  const occ     = (occRows     ?? []) as DailyOccupancyRow[]

  const total_revenue   = income.reduce((s, r) => s + Number(r.total_revenue),  0)
  const room_revenue    = income.reduce((s, r) => s + Number(r.room_revenue),   0)
  const extras_revenue  = income.reduce((s, r) => s + Number(r.extras_revenue), 0)
  const booking_count   = income.reduce((s, r) => s + Number(r.booking_count),  0)
  const total_expenses  = expense.reduce((s, r) => s + Number(r.total_expenses), 0)

  const total_rooms = occ.length > 0 ? Number(occ[0].total_rooms) : null
  const occPctSum   = occ.reduce((s, r) => s + Number(r.occupancy_pct ?? 0), 0)
  const avg_occupancy_pct = occ.length > 0 && total_rooms ? Math.round((occPctSum / occ.length) * 100) / 100 : null

  return {
    total_revenue,
    room_revenue,
    extras_revenue,
    booking_count,
    total_expenses,
    net: total_revenue - total_expenses,
    avg_occupancy_pct,
    total_rooms,
  }
}

/** Cached wrapper — Next will key by period.from/to ISO. */
export const getHubTotals = (period: PeriodRange) => unstable_cache(
  () => fetchHubTotalsRaw(period),
  ['hub-totals', toIsoDate(period.from), toIsoDate(period.to)],
  { revalidate: 60, tags: ['reports'] },
)()

/** Same as getHubTotals but for the comparison range. */
export const getHubTotalsForComparison = (
  period: PeriodRange,
  mode: 'previous_period' | 'year_over_year',
) => {
  const cmp = getComparisonRange(period, mode)
  return getHubTotals(cmp)
}

/** 30-day daily revenue sparkline (independent of period). */
export const getRevenueSparkline = unstable_cache(
  async (): Promise<Array<{ date: string; revenue: number }>> => {
    const db = createServiceClient() as any  // eslint-disable-line @typescript-eslint/no-explicit-any
    const today = new Date()
    const from = new Date(today.getTime() - 29 * 86400_000)
    const fromIso = toIsoDate(from)
    const toIso   = toIsoDate(today)
    const { data } = await db
      .from('bookings')
      .select('visit_date, total')
      .gte('visit_date', fromIso)
      .lte('visit_date', toIso)
      .neq('status', 'cancelled')
    const byDay = new Map<string, number>()
    for (const r of (data ?? []) as Array<{ visit_date: string; total: number }>) {
      byDay.set(r.visit_date, (byDay.get(r.visit_date) ?? 0) + Number(r.total ?? 0))
    }
    const out: Array<{ date: string; revenue: number }> = []
    for (let i = 0; i < 30; i++) {
      const d = new Date(from.getTime() + i * 86400_000)
      const iso = toIsoDate(d)
      out.push({ date: iso, revenue: byDay.get(iso) ?? 0 })
    }
    return out
  },
  ['revenue-sparkline'],
  { revalidate: 60, tags: ['reports'] },
)
