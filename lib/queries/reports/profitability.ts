import { createServiceClient } from '@/lib/supabase/server'
import { unstable_cache } from 'next/cache'
import { toIsoDate } from '@/lib/reports/periods'
import { getDataStartDate } from '@/lib/reports/sufficient-data'
import type { PeriodRange } from '@/lib/reports/types'

const db = () => createServiceClient() as any  // eslint-disable-line @typescript-eslint/no-explicit-any

export interface MonthlyPnLRow {
  month: string             // YYYY-MM-01
  income: number
  expenses: number
  net: number
  margin_pct: number | null
}

async function fetchMonthlyPnL(period: PeriodRange): Promise<MonthlyPnLRow[]> {
  const fromIso = toIsoDate(period.from)
  const toIso   = toIsoDate(period.to)
  const [{ data: incomeRows }, { data: expRows }] = await Promise.all([
    db().rpc('reports_monthly_income',   { p_from: fromIso, p_to: toIso }),
    db().rpc('reports_monthly_expenses', { p_from: fromIso, p_to: toIso }),
  ])
  const expByMonth = new Map<string, number>()
  for (const e of (expRows ?? []) as Array<{ month: string; total_expenses: number }>) {
    expByMonth.set(e.month, Number(e.total_expenses ?? 0))
  }
  return ((incomeRows ?? []) as Array<{ month: string; total_revenue: number }>).map((i) => {
    const income   = Number(i.total_revenue ?? 0)
    const expenses = expByMonth.get(i.month) ?? 0
    const net      = income - expenses
    return {
      month: i.month,
      income,
      expenses,
      net,
      margin_pct: income > 0 ? Math.round((net / income) * 1000) / 10 : null,
    }
  })
}

export const getMonthlyPnL = (period: PeriodRange) => unstable_cache(
  () => fetchMonthlyPnL(period),
  ['reports-monthly-pnl', toIsoDate(period.from), toIsoDate(period.to)],
  { revalidate: 60, tags: ['reports'] },
)()

// ─── Cash position: cumulative income - cumulative expenses, day by day ──────

export interface CashPositionPoint { date: string; cumulative_income: number; cumulative_expenses: number; balance: number }

export async function getCashPosition(period: PeriodRange): Promise<CashPositionPoint[]> {
  // Daily revenue from bookings + finalized checkout extras; daily expenses from non-draft.
  const fromIso = toIsoDate(period.from)
  const toIso   = toIsoDate(period.to)
  const [{ data: bookings }, { data: checkouts }, { data: expenses }] = await Promise.all([
    db().from('bookings').select('visit_date, total')
      .gte('visit_date', fromIso).lte('visit_date', toIso).neq('status', 'cancelled'),
    db().from('checkouts').select('finalized_at, charges_total')
      .eq('status', 'finalized')
      .gte('finalized_at', fromIso).lte('finalized_at', `${toIso}T23:59:59`),
    db().from('expenses').select('expense_date, amount')
      .gte('expense_date', fromIso).lte('expense_date', toIso).eq('is_draft', false),
  ])
  const inMap = new Map<string, number>()
  const exMap = new Map<string, number>()
  for (const b of (bookings  ?? []) as Array<{ visit_date: string; total: number }>) inMap.set(b.visit_date, (inMap.get(b.visit_date) ?? 0) + Number(b.total ?? 0))
  for (const c of (checkouts ?? []) as Array<{ finalized_at: string; charges_total: number }>) {
    const k = c.finalized_at.slice(0, 10)
    inMap.set(k, (inMap.get(k) ?? 0) + Number(c.charges_total ?? 0))
  }
  for (const e of (expenses  ?? []) as Array<{ expense_date: string; amount: number }>) exMap.set(e.expense_date, (exMap.get(e.expense_date) ?? 0) + Number(e.amount ?? 0))

  const out: CashPositionPoint[] = []
  let cumIn = 0, cumEx = 0
  let d = new Date(period.from)
  while (d <= period.to) {
    const iso = toIsoDate(d)
    cumIn += inMap.get(iso) ?? 0
    cumEx += exMap.get(iso) ?? 0
    out.push({ date: iso, cumulative_income: cumIn, cumulative_expenses: cumEx, balance: cumIn - cumEx })
    d = new Date(d.getTime() + 86400_000)
  }
  return out
}

// We only fetch the start date once for context
export { getDataStartDate }
