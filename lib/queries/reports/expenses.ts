import { createServiceClient } from '@/lib/supabase/server'
import { unstable_cache } from 'next/cache'
import { toIsoDate } from '@/lib/reports/periods'
import type { PeriodRange } from '@/lib/reports/types'

const db = () => createServiceClient() as any  // eslint-disable-line @typescript-eslint/no-explicit-any

export interface DailyExpenseRow { date: string; total: number; count: number }
export interface CategoryGroupRow { group: string; total: number; pct: number }
export interface CategoryRow { category_name: string; group: string; total: number; transactions: number }
export interface VendorRow { payee_name: string; payee_type: string; total: number; transactions: number }

async function fetchDailyExpenses(period: PeriodRange): Promise<DailyExpenseRow[]> {
  const { data } = await db().from('expenses')
    .select('expense_date, amount')
    .gte('expense_date', toIsoDate(period.from))
    .lte('expense_date', toIsoDate(period.to))
    .eq('is_draft', false)
  const byDay = new Map<string, DailyExpenseRow>()
  let d = new Date(period.from)
  while (d <= period.to) {
    const iso = toIsoDate(d)
    byDay.set(iso, { date: iso, total: 0, count: 0 })
    d = new Date(d.getTime() + 86400_000)
  }
  for (const r of (data ?? []) as Array<{ expense_date: string; amount: number }>) {
    const row = byDay.get(r.expense_date)
    if (!row) continue
    row.total += Number(r.amount ?? 0)
    row.count += 1
  }
  return Array.from(byDay.values())
}

export const getDailyExpenses = (period: PeriodRange) => unstable_cache(
  () => fetchDailyExpenses(period),
  ['reports-daily-expenses', toIsoDate(period.from), toIsoDate(period.to)],
  { revalidate: 60, tags: ['reports'] },
)()

async function fetchCategoryBreakdown(period: PeriodRange): Promise<{ groups: CategoryGroupRow[]; categories: CategoryRow[] }> {
  const { data } = await db().from('expenses')
    .select('amount, category:expense_categories!inner (name, category_group)')
    .gte('expense_date', toIsoDate(period.from))
    .lte('expense_date', toIsoDate(period.to))
    .eq('is_draft', false)
  const byGroup = new Map<string, number>()
  const byCat = new Map<string, { name: string; group: string; total: number; tx: number }>()
  let total = 0
  for (const r of (data ?? []) as Array<{ amount: number; category: { name: string; category_group: string } }>) {
    const amt = Number(r.amount ?? 0)
    const grp = r.category?.category_group ?? 'other'
    const nm  = r.category?.name ?? '(uncategorized)'
    byGroup.set(grp, (byGroup.get(grp) ?? 0) + amt)
    const k = `${grp}|${nm}`
    const e = byCat.get(k) ?? { name: nm, group: grp, total: 0, tx: 0 }
    e.total += amt; e.tx += 1
    byCat.set(k, e)
    total += amt
  }
  const groups: CategoryGroupRow[] = Array.from(byGroup.entries())
    .map(([group, sum]) => ({ group, total: sum, pct: total > 0 ? Math.round((sum / total) * 1000) / 10 : 0 }))
    .sort((a, b) => b.total - a.total)
  const categories: CategoryRow[] = Array.from(byCat.values())
    .map((c) => ({ category_name: c.name, group: c.group, total: c.total, transactions: c.tx }))
    .sort((a, b) => b.total - a.total)
  return { groups, categories }
}

export const getCategoryBreakdownReports = (period: PeriodRange) => unstable_cache(
  () => fetchCategoryBreakdown(period),
  ['reports-category-breakdown', toIsoDate(period.from), toIsoDate(period.to)],
  { revalidate: 60, tags: ['reports'] },
)()

async function fetchTopVendors(period: PeriodRange, limit = 10): Promise<VendorRow[]> {
  const { data } = await db().from('expenses')
    .select('amount, payee:expense_payees!inner (name, payee_type)')
    .gte('expense_date', toIsoDate(period.from))
    .lte('expense_date', toIsoDate(period.to))
    .eq('is_draft', false)
  const byPayee = new Map<string, VendorRow>()
  for (const r of (data ?? []) as Array<{ amount: number; payee: { name: string; payee_type: string } }>) {
    const k = r.payee?.name ?? '(unknown)'
    const cur = byPayee.get(k) ?? { payee_name: k, payee_type: r.payee?.payee_type ?? 'unknown', total: 0, transactions: 0 }
    cur.total += Number(r.amount ?? 0); cur.transactions += 1
    byPayee.set(k, cur)
  }
  return Array.from(byPayee.values()).sort((a, b) => b.total - a.total).slice(0, limit)
}

export const getTopVendors = (period: PeriodRange) => unstable_cache(
  () => fetchTopVendors(period),
  ['reports-top-vendors', toIsoDate(period.from), toIsoDate(period.to)],
  { revalidate: 60, tags: ['reports'] },
)()

// Budget vs actual (fetches budgets + sums actuals; soft-fails when budgets table missing)
export interface BudgetVarianceRow { category_name: string; budgeted: number; actual: number; variance: number; variance_pct: number | null; status: 'under' | 'on_track' | 'warn' | 'over' }

export async function getBudgetVsActual(period: PeriodRange): Promise<BudgetVarianceRow[]> {
  // Resolve to a single year+month if the period spans exactly one calendar month
  const month = period.from.getMonth() + 1
  const year  = period.from.getFullYear()
  try {
    const { data: budgets } = await db().from('expense_budgets').select('*').eq('year', year).eq('month', month)
    const { data: actuals } = await db().from('expenses')
      .select('amount, category:expense_categories!inner (id, name)')
      .gte('expense_date', toIsoDate(period.from))
      .lte('expense_date', toIsoDate(period.to))
      .eq('is_draft', false)
    const actualByCat = new Map<string, { name: string; total: number }>()
    for (const a of (actuals ?? []) as any[]) {  // eslint-disable-line @typescript-eslint/no-explicit-any
      const k = a.category?.id ?? '_unknown'
      const cur = actualByCat.get(k) ?? { name: a.category?.name ?? '?', total: 0 }
      cur.total += Number(a.amount ?? 0)
      actualByCat.set(k, cur)
    }
    return ((budgets ?? []) as any[]).map((b) => {  // eslint-disable-line @typescript-eslint/no-explicit-any
      const a = actualByCat.get(b.category_id) ?? { name: '?', total: 0 }
      const variance = a.total - Number(b.amount ?? 0)
      const variance_pct = b.amount > 0 ? Math.round((variance / Number(b.amount)) * 1000) / 10 : null
      let status: BudgetVarianceRow['status'] = 'on_track'
      if (variance < 0) status = 'under'
      else if (variance_pct !== null && variance_pct > 10) status = 'over'
      else if (variance_pct !== null && variance_pct > 0) status = 'warn'
      return { category_name: a.name, budgeted: Number(b.amount), actual: a.total, variance, variance_pct, status }
    }).sort((a, b) => b.variance - a.variance)
  } catch {
    return []
  }
}
