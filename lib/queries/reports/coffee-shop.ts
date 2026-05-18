import { createServiceClient } from '@/lib/supabase/server'
import { unstable_cache } from 'next/cache'
import { toIsoDate } from '@/lib/reports/periods'
import type { PeriodRange } from '@/lib/reports/types'

const db = () => createServiceClient() as any  // eslint-disable-line @typescript-eslint/no-explicit-any

export interface CoffeeShopOverview {
  sales_count:       number
  net_revenue:       number
  avg_sale:          number
  comp_value:        number
  total_discount:    number
  voided_count:      number
  voided_value:      number
  daily:             Array<{ date: string; revenue: number }>
  payment_mix:       Array<{ method: string; amount: number; pct: number }>
  top_items:         Array<{ name: string; category: string; units_sold: number; revenue: number; pct: number }>
  category_split:    Array<{ category: string; revenue: number; pct: number }>
  top_item_summary:  { name: string; units_sold: number } | null
}

export const getCoffeeShopOverview = (period: PeriodRange) => unstable_cache(
  async (): Promise<CoffeeShopOverview> => {
    const fromIso = toIsoDate(period.from)
    const toIso   = toIsoDate(period.to)

    const [{ data: sales }, { data: payments }, { data: items }] = await Promise.all([
      db().from('coffee_shop_sales').select('id, status, net_amount, comp_value, discount_amount, sale_date')
        .gte('sale_date', fromIso).lte('sale_date', toIso),
      db().from('coffee_shop_sale_payments')
        .select('amount, method, sale:coffee_shop_sales!inner (status, sale_date)')
        .gte('sale.sale_date', fromIso).lte('sale.sale_date', toIso),
      db().from('coffee_shop_sale_items')
        .select('description, quantity, amount, is_complimentary, category:charge_categories!inner (display_name), sale:coffee_shop_sales!inner (status, sale_date)')
        .gte('sale.sale_date', fromIso).lte('sale.sale_date', toIso),
    ])

    const completed = ((sales ?? []) as any[]).filter((s) => s.status === 'completed')  // eslint-disable-line @typescript-eslint/no-explicit-any
    const voided    = ((sales ?? []) as any[]).filter((s) => s.status === 'voided')     // eslint-disable-line @typescript-eslint/no-explicit-any
    const net_revenue   = completed.reduce((s, r) => s + Number(r.net_amount ?? 0), 0)
    const comp_value    = completed.reduce((s, r) => s + Number(r.comp_value ?? 0), 0)
    const total_discount = completed.reduce((s, r) => s + Number(r.discount_amount ?? 0), 0)
    const voided_value  = voided.reduce((s, r) => s + Number(r.net_amount ?? 0), 0)

    // Daily zero-fill
    const dailyMap = new Map<string, number>()
    let d = new Date(period.from)
    while (d <= period.to) { dailyMap.set(toIsoDate(d), 0); d = new Date(d.getTime() + 86400_000) }
    for (const r of completed) {
      dailyMap.set(r.sale_date, (dailyMap.get(r.sale_date) ?? 0) + Number(r.net_amount ?? 0))
    }
    const daily = Array.from(dailyMap.entries()).map(([date, revenue]) => ({ date, revenue }))

    // Payment mix
    const paymentTotals = new Map<string, number>()
    for (const p of (payments ?? []) as any[]) {  // eslint-disable-line @typescript-eslint/no-explicit-any
      if (p.sale?.status !== 'completed') continue
      const amt = Number(p.amount ?? 0)
      paymentTotals.set(p.method, (paymentTotals.get(p.method) ?? 0) + amt)
    }
    const totalTendered = Array.from(paymentTotals.values()).reduce((s, v) => s + v, 0)
    const payment_mix = Array.from(paymentTotals.entries())
      .map(([method, amount]) => ({ method, amount, pct: totalTendered > 0 ? Math.round((amount / totalTendered) * 1000) / 10 : 0 }))
      .sort((a, b) => b.amount - a.amount)

    // Items aggregation
    const byItem = new Map<string, { name: string; category: string; units_sold: number; revenue: number }>()
    const byCat  = new Map<string, number>()
    for (const it of (items ?? []) as any[]) {  // eslint-disable-line @typescript-eslint/no-explicit-any
      if (it.sale?.status !== 'completed') continue
      const name = it.description
      const cat  = it.category?.display_name ?? '—'
      const cur = byItem.get(name) ?? { name, category: cat, units_sold: 0, revenue: 0 }
      cur.units_sold += Number(it.quantity ?? 0)
      // Comp items count toward units sold but not revenue
      if (!it.is_complimentary) cur.revenue += Number(it.amount ?? 0)
      byItem.set(name, cur)
      if (!it.is_complimentary) byCat.set(cat, (byCat.get(cat) ?? 0) + Number(it.amount ?? 0))
    }
    const allItemsRev = Array.from(byItem.values()).reduce((s, v) => s + v.revenue, 0)
    const top_items = Array.from(byItem.values())
      .map((r) => ({ ...r, pct: allItemsRev > 0 ? Math.round((r.revenue / allItemsRev) * 1000) / 10 : 0 }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 20)

    const allCatRev = Array.from(byCat.values()).reduce((s, v) => s + v, 0)
    const category_split = Array.from(byCat.entries())
      .map(([category, revenue]) => ({ category, revenue, pct: allCatRev > 0 ? Math.round((revenue / allCatRev) * 1000) / 10 : 0 }))
      .sort((a, b) => b.revenue - a.revenue)

    const topByUnits = Array.from(byItem.values()).sort((a, b) => b.units_sold - a.units_sold)[0]
    return {
      sales_count: completed.length,
      net_revenue,
      avg_sale: completed.length > 0 ? Math.round(net_revenue / completed.length) : 0,
      comp_value,
      total_discount,
      voided_count: voided.length,
      voided_value,
      daily,
      payment_mix,
      top_items,
      category_split,
      top_item_summary: topByUnits ? { name: topByUnits.name, units_sold: topByUnits.units_sold } : null,
    }
  },
  ['reports-coffee-shop', toIsoDate(period.from), toIsoDate(period.to)],
  { revalidate: 60, tags: ['reports'] },
)()

// Cash drawer reconciliation
export interface CashDrawerRow {
  sale_id:        string
  sale_number:    string
  net_amount:     number
  cash_component: number
  created_by_id:  string | null
}

export async function getCashDrawer(period: PeriodRange): Promise<{
  total_cash: number
  total_digital: number
  cash_sales_count: number
  rows: CashDrawerRow[]
}> {
  const fromIso = toIsoDate(period.from)
  const toIso   = toIsoDate(period.to)
  const { data } = await db()
    .from('coffee_shop_sales')
    .select('id, sale_number, net_amount, status, created_by, payments:coffee_shop_sale_payments (amount, method)')
    .eq('status', 'completed')
    .gte('sale_date', fromIso).lte('sale_date', toIso)
    .order('sale_number', { ascending: true })

  let total_cash = 0, total_digital = 0
  const rows: CashDrawerRow[] = []
  let cash_sales_count = 0
  for (const s of (data ?? []) as any[]) {  // eslint-disable-line @typescript-eslint/no-explicit-any
    let cash = 0
    for (const p of s.payments ?? []) {
      const amt = Number(p.amount ?? 0)
      if (p.method === 'cash') cash += amt
      else total_digital += amt
    }
    if (cash > 0) {
      cash_sales_count += 1
      total_cash += cash
      rows.push({ sale_id: s.id, sale_number: s.sale_number, net_amount: Number(s.net_amount ?? 0), cash_component: cash, created_by_id: s.created_by })
    }
  }
  return { total_cash, total_digital, cash_sales_count, rows }
}
