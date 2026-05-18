import { createClient } from '@/lib/supabase/server'
import type {
  CoffeeShopSaleRow,
  CoffeeShopSaleFull,
  CoffeeShopSaleStatus,
  CoffeeShopPaymentMethod,
} from '@/lib/supabase/types-coffee-shop'
import { getTodayInDhaka } from '@/lib/coffee-shop/timezone'

const db = () => createClient() as any  // eslint-disable-line @typescript-eslint/no-explicit-any

export interface CoffeeShopSaleFilters {
  from_date?: string
  to_date?:   string
  status?:    CoffeeShopSaleStatus | 'all'
  search?:    string
  payment_method?: CoffeeShopPaymentMethod
  created_by?: string
  limit?:     number
}

/** List sales with filters. Default last 7 days, completed only. */
export async function listCoffeeShopSales(filters: CoffeeShopSaleFilters = {}): Promise<CoffeeShopSaleRow[]> {
  let query = db().from('coffee_shop_sales').select('*')
    .order('sale_date', { ascending: false })
    .order('created_at', { ascending: false })

  if (filters.from_date) query = query.gte('sale_date', filters.from_date)
  if (filters.to_date)   query = query.lte('sale_date', filters.to_date)
  if (filters.status && filters.status !== 'all') query = query.eq('status', filters.status)
  if (filters.created_by) query = query.eq('created_by', filters.created_by)
  if (filters.search) {
    query = query.or(`sale_number.ilike.%${filters.search}%,customer_label.ilike.%${filters.search}%`)
  }
  if (filters.limit) query = query.limit(filters.limit)

  const { data, error } = await query
  if (error) throw new Error(`listCoffeeShopSales: ${error.message}`)
  return (data ?? []) as CoffeeShopSaleRow[]
}

/** Detail view: sale header + items + payments. */
export async function getCoffeeShopSaleById(id: string): Promise<CoffeeShopSaleFull | null> {
  const [{ data: sale }, { data: items }, { data: payments }] = await Promise.all([
    db().from('coffee_shop_sales').select('*').eq('id', id).maybeSingle(),
    db().from('coffee_shop_sale_items').select('*').eq('sale_id', id).order('display_order', { ascending: true }),
    db().from('coffee_shop_sale_payments').select('*').eq('sale_id', id).order('display_order', { ascending: true }),
  ])
  if (!sale) return null
  return { ...sale, items: items ?? [], payments: payments ?? [] } as CoffeeShopSaleFull
}

/** Today's hub KPIs (Dhaka time). Excludes voided sales from revenue totals. */
export interface CoffeeShopDailyKpis {
  date:           string
  sales_count:    number
  total_revenue:  number
  cash_total:     number
  digital_total:  number
}

export async function getDailySummary(saleDate?: string): Promise<CoffeeShopDailyKpis> {
  const date = saleDate ?? getTodayInDhaka()
  const [{ data: sales }, { data: payments }] = await Promise.all([
    db().from('coffee_shop_sales').select('id, status, net_amount').eq('sale_date', date),
    db().from('coffee_shop_sale_payments')
      .select('amount, method, sale:coffee_shop_sales!inner (sale_date, status)')
      .eq('sale.sale_date', date),
  ])
  const completed = ((sales ?? []) as Array<{ status: string; net_amount: number }>)
    .filter((s) => s.status === 'completed')
  const total_revenue = completed.reduce((s, r) => s + Number(r.net_amount ?? 0), 0)
  let cash_total = 0, digital_total = 0
  for (const p of (payments ?? []) as any[]) {  // eslint-disable-line @typescript-eslint/no-explicit-any
    if (p.sale?.status !== 'completed') continue
    const amt = Number(p.amount ?? 0)
    if (p.method === 'cash') cash_total += amt
    else digital_total += amt
  }
  return {
    date,
    sales_count:   completed.length,
    total_revenue,
    cash_total,
    digital_total,
  }
}
