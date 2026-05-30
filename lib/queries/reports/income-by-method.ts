import { createClient } from '@/lib/supabase/server'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createClient() as any

export const PAYMENT_METHODS = ['cash', 'bkash', 'card', 'bank_transfer', 'other'] as const
export type PaymentMethod = typeof PAYMENT_METHODS[number]

export const METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: 'Cash', bkash: 'bKash', card: 'Card', bank_transfer: 'Bank transfer', other: 'Other',
}

export interface IncomeByMethodRow {
  method:        PaymentMethod
  checkout:      number   // guest checkout payments
  coffee_shop:   number   // coffee shop sales
  total:         number
}

export interface Settlement {
  method:      PaymentMethod
  source:      'checkout' | 'coffee_shop'
  time:        string        // 'HH:MM AM/PM' Dhaka local, or '' if not tracked per payment
  reference:   string | null
  description: string        // 'GCR-B-2026-0245 — Sadia' or 'CS-20260530-001 — walk-in'
  amount:      number
}

export interface DailyIncomeByMethod {
  date:        string
  rows:        IncomeByMethodRow[]
  checkout:    number
  coffee_shop: number
  total:       number
  settlements: Settlement[]
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

  // Pull every individual payment in window, plus enough context (checkout_id
  // and sale_number/customer_label) to label each settlement for cross-check.
  const [{ data: coPayments, error: coErr }, { data: csPayments, error: csErr }] = await Promise.all([
    db().from('checkout_payments').select('amount, method, paid_at, reference, checkout_id')
      .gte('paid_at', startIso).lt('paid_at', endIso),
    db().from('coffee_shop_sale_payments').select('amount, method, reference, sale:coffee_shop_sales!inner(sale_number, customer_label, sale_date, status)')
      .eq('sale.sale_date', date).eq('sale.status', 'completed'),
  ])
  if (coErr) throw new Error(`[reports.incomeByMethod.checkout] ${coErr.message}`)
  if (csErr) throw new Error(`[reports.incomeByMethod.coffeeShop] ${csErr.message}`)

  // Resolve checkout_id → booking_number + customer_name for the labels.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const checkoutIds = [...new Set((coPayments ?? []).map((p: any) => p.checkout_id))]
  const bookingByCheckout = new Map<string, { booking_number: string; customer_name: string }>()
  if (checkoutIds.length) {
    const { data: checkouts } = await db().from('checkouts').select('id, booking_id').in('id', checkoutIds)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bookingIds = [...new Set((checkouts ?? []).map((c: any) => c.booking_id))]
    if (bookingIds.length) {
      const { data: bookings } = await db().from('bookings').select('id, booking_number, customer_name').in('id', bookingIds)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const bookingById = new Map<string, any>((bookings ?? []).map((b: any) => [b.id, b]))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const c of (checkouts ?? []) as any[]) {
        const b = bookingById.get(c.booking_id)
        if (b) bookingByCheckout.set(c.id, { booking_number: b.booking_number, customer_name: b.customer_name })
      }
    }
  }

  const co = new Map<PaymentMethod, number>()
  const cs = new Map<PaymentMethod, number>()
  const settlements: Settlement[] = []

  function formatDhakaTime(iso: string): string {
    try {
      return new Date(iso).toLocaleTimeString('en-US', {
        hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Dhaka',
      })
    } catch { return '' }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const r of (coPayments ?? []) as any[]) {
    const m = (PAYMENT_METHODS as readonly string[]).includes(r.method) ? r.method as PaymentMethod : 'other'
    const amount = Number(r.amount ?? 0)
    co.set(m, (co.get(m) ?? 0) + amount)
    const b = bookingByCheckout.get(r.checkout_id)
    settlements.push({
      method:      m,
      source:      'checkout',
      time:        formatDhakaTime(r.paid_at),
      reference:   r.reference ?? null,
      description: b ? `${b.booking_number} — ${b.customer_name}` : '(checkout)',
      amount:      Math.round(amount * 100) / 100,
    })
  }
  // Defence-in-depth: the embedded !inner filter on a foreign-table column
  // isn't always reliable. Verify status === 'completed' here as well.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const r of (csPayments ?? []) as any[]) {
    if (!r.sale || r.sale.status !== 'completed') continue
    const m = (PAYMENT_METHODS as readonly string[]).includes(r.method) ? r.method as PaymentMethod : 'other'
    const amount = Number(r.amount ?? 0)
    cs.set(m, (cs.get(m) ?? 0) + amount)
    settlements.push({
      method:      m,
      source:      'coffee_shop',
      time:        '',   // coffee-shop sale payments aren't timestamped per row
      reference:   r.reference ?? null,
      description: r.sale.sale_number + (r.sale.customer_label ? ` — ${r.sale.customer_label}` : ''),
      amount:      Math.round(amount * 100) / 100,
    })
  }

  // Sort by method (PAYMENT_METHODS order), then time ascending.
  const methodOrder = new Map(PAYMENT_METHODS.map((m, i) => [m, i]))
  settlements.sort((a, b) => {
    const mo = (methodOrder.get(a.method) ?? 99) - (methodOrder.get(b.method) ?? 99)
    if (mo !== 0) return mo
    return a.time.localeCompare(b.time)
  })

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
    settlements,
  }
}
