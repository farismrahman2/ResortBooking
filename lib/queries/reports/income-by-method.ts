import { createClient } from '@/lib/supabase/server'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createClient() as any

export const PAYMENT_METHODS = ['cash', 'bkash', 'nagad', 'rocket', 'card', 'bank_transfer', 'other'] as const
export type PaymentMethod = typeof PAYMENT_METHODS[number]

export const METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: 'Cash', bkash: 'bKash', nagad: 'Nagad', rocket: 'Rocket',
  card: 'Card', bank_transfer: 'Bank transfer', other: 'Other',
}

export interface IncomeByMethodRow {
  method:        PaymentMethod
  checkout:      number   // guest checkout payments
  coffee_shop:   number   // coffee shop sales
  total:         number
}

export interface DailyIncomeByMethod {
  date:        string
  rows:        IncomeByMethodRow[]
  checkout:    number
  coffee_shop: number
  total:       number
}

/**
 * Sum of all method-tagged income on a single business day (Asia/Dhaka).
 *
 *   checkout_payments        — guest checkout receipts (paid_at)
 *   coffee_shop_sale_payments — coffee shop sales (sale_date, status=completed)
 *
 * Note: booking advances have no payment_method column in this codebase,
 * so they're not attributable to a method and are excluded. Most settle via
 * checkout anyway, which is captured here.
 */
export async function getDailyIncomeByMethod(date: string): Promise<DailyIncomeByMethod> {
  // Dhaka local-day boundaries as ISO with offset.
  const startIso = `${date}T00:00:00+06:00`
  const nextDay = new Date(date + 'T00:00:00+06:00')
  nextDay.setDate(nextDay.getDate() + 1)
  const endIso = nextDay.toISOString()

  const [{ data: coPayments, error: coErr }, { data: csPayments, error: csErr }] = await Promise.all([
    db().from('checkout_payments').select('amount, method, paid_at')
      .gte('paid_at', startIso).lt('paid_at', endIso),
    db().from('coffee_shop_sale_payments').select('amount, method, sale:coffee_shop_sales!inner(sale_date, status)')
      .eq('sale.sale_date', date).eq('sale.status', 'completed'),
  ])
  if (coErr) throw new Error(`[reports.incomeByMethod.checkout] ${coErr.message}`)
  if (csErr) throw new Error(`[reports.incomeByMethod.coffeeShop] ${csErr.message}`)

  const co = new Map<PaymentMethod, number>()
  const cs = new Map<PaymentMethod, number>()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const r of (coPayments ?? []) as any[]) {
    const m = (PAYMENT_METHODS as readonly string[]).includes(r.method) ? r.method as PaymentMethod : 'other'
    co.set(m, (co.get(m) ?? 0) + Number(r.amount ?? 0))
  }
  // Defence-in-depth: the embedded !inner filter on a foreign-table column
  // isn't always reliable. Verify status === 'completed' here as well.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const r of (csPayments ?? []) as any[]) {
    if (!r.sale || r.sale.status !== 'completed') continue
    const m = (PAYMENT_METHODS as readonly string[]).includes(r.method) ? r.method as PaymentMethod : 'other'
    cs.set(m, (cs.get(m) ?? 0) + Number(r.amount ?? 0))
  }

  const rows: IncomeByMethodRow[] = PAYMENT_METHODS.map((method) => {
    const checkout = Math.round((co.get(method) ?? 0) * 100) / 100
    const coffee_shop = Math.round((cs.get(method) ?? 0) * 100) / 100
    return { method, checkout, coffee_shop, total: Math.round((checkout + coffee_shop) * 100) / 100 }
  })

  const checkoutTotal    = rows.reduce((s, r) => s + r.checkout, 0)
  const coffeeShopTotal  = rows.reduce((s, r) => s + r.coffee_shop, 0)
  return {
    date, rows,
    checkout:    Math.round(checkoutTotal * 100) / 100,
    coffee_shop: Math.round(coffeeShopTotal * 100) / 100,
    total:       Math.round((checkoutTotal + coffeeShopTotal) * 100) / 100,
  }
}
