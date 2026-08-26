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
export interface MethodRangeRow {
  method:      PaymentMethod
  advances:    number   // booking advances — all received via bKash at this resort
  checkout:    number
  coffee_shop: number
  total:       number
}

export interface MethodDailyRow {
  date:     string
  byMethod: Record<PaymentMethod, number>
  total:    number
}

export interface IncomeByMethodRange {
  from: string
  to:   string
  rows: MethodRangeRow[]
  daily: MethodDailyRow[]
  totals: { advances: number; checkout: number; coffee_shop: number; total: number }
}

const r2 = (n: number) => Math.round(n * 100) / 100

/**
 * Everything the resort RECEIVED over a range, bucketed by payment method —
 * the sheet accounts matches against the bank/bKash statements.
 *
 * Three inflows:
 *   booking advances    — no method column exists; the resort takes every
 *                         advance via bKash, so they are attributed to bKash,
 *                         dated by the booking's creation day (Dhaka).
 *                         Cancellations/no-shows stay included: the advance is
 *                         non-refundable, the money really arrived.
 *   checkout payments   — method-tagged, dated by paid_at (Dhaka day)
 *   coffee-shop payments — method-tagged, dated by sale_date, completed sales
 */
export async function getIncomeByMethodRange(
  fromIso: string, toIso: string,
): Promise<IncomeByMethodRange> {
  const startTs = `${fromIso}T00:00:00+06:00`
  const endExcl = new Date(`${toIso}T00:00:00+06:00`)
  endExcl.setDate(endExcl.getDate() + 1)
  const endTs = endExcl.toISOString()

  const toDhakaDay = (iso: string): string =>
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date(iso))

  const [ledgerRes, advRes, coRes, csRes] = await Promise.all([
    // Advance instalments — the real ledger: each part with the date, time and
    // method it actually arrived. Absent until migration 003 runs.
    db().from('booking_advance_payments')
      .select('amount, method, paid_at')
      .gte('paid_at', startTs).lt('paid_at', endTs)
      .limit(10_000),
    // Fallback for installs without the ledger: the booking's own advance,
    // dated to when the booking was made.
    db().from('bookings')
      .select('created_at, advance_paid, advance_method')
      .gt('advance_paid', 0)
      .gte('created_at', startTs).lt('created_at', endTs)
      .limit(10_000),
    db().from('checkout_payments')
      .select('amount, method, paid_at')
      .gte('paid_at', startTs).lt('paid_at', endTs)
      .limit(10_000),
    db().from('coffee_shop_sale_payments')
      .select('amount, method, sale:coffee_shop_sales!inner(sale_date, status)')
      .eq('sale.status', 'completed')
      .gte('sale.sale_date', fromIso).lte('sale.sale_date', toIso)
      .limit(10_000),
  ])
  const ledgerMissing = Boolean(ledgerRes.error && /does not exist|42P01/i.test(ledgerRes.error.message))
  if (ledgerRes.error && !ledgerMissing) {
    throw new Error(`[incomeByMethodRange.advanceLedger] ${ledgerRes.error.message}`)
  }
  if (advRes.error) throw new Error(`[incomeByMethodRange.advances] ${advRes.error.message}`)
  if (coRes.error)  throw new Error(`[incomeByMethodRange.checkout] ${coRes.error.message}`)
  if (csRes.error)  throw new Error(`[incomeByMethodRange.coffeeShop] ${csRes.error.message}`)

  const emptyByMethod = (): Record<PaymentMethod, number> =>
    Object.fromEntries(PAYMENT_METHODS.map((m) => [m, 0])) as Record<PaymentMethod, number>

  const bySource = {
    advances:    emptyByMethod(),
    checkout:    emptyByMethod(),
    coffee_shop: emptyByMethod(),
  }
  const dailyMap = new Map<string, Record<PaymentMethod, number>>()
  const addDaily = (day: string, method: PaymentMethod, amount: number) => {
    if (day < fromIso || day > toIso) return   // Dhaka-day conversion can nudge edges
    const rec = dailyMap.get(day) ?? emptyByMethod()
    rec[method] += amount
    dailyMap.set(day, rec)
  }

  // The ledger is authoritative: a bKash part-payment on the 3rd and a bank
  // transfer on the 9th land on their own days, in their own columns. Only
  // when the ledger table doesn't exist do we fall back to the booking's
  // single advance figure.
  if (!ledgerMissing) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const p of (ledgerRes.data ?? []) as any[]) {
      const amount = Number(p.amount ?? 0)
      const m = (PAYMENT_METHODS as readonly string[]).includes(p.method)
        ? p.method as PaymentMethod : 'other'
      bySource.advances[m] += amount
      addDaily(toDhakaDay(p.paid_at), m, amount)
    }
  } else {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const b of (advRes.data ?? []) as any[]) {
      const amount = Number(b.advance_paid ?? 0)
      const m = (PAYMENT_METHODS as readonly string[]).includes(b.advance_method)
        ? b.advance_method as PaymentMethod : 'bkash'
      bySource.advances[m] += amount
      addDaily(toDhakaDay(b.created_at), m, amount)
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const p of (coRes.data ?? []) as any[]) {
    const m = (PAYMENT_METHODS as readonly string[]).includes(p.method) ? p.method as PaymentMethod : 'other'
    const amount = Number(p.amount ?? 0)
    bySource.checkout[m] += amount
    addDaily(toDhakaDay(p.paid_at), m, amount)
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const p of (csRes.data ?? []) as any[]) {
    if (!p.sale || p.sale.status !== 'completed') continue
    const m = (PAYMENT_METHODS as readonly string[]).includes(p.method) ? p.method as PaymentMethod : 'other'
    const amount = Number(p.amount ?? 0)
    bySource.coffee_shop[m] += amount
    addDaily(p.sale.sale_date as string, m, amount)
  }

  const rows: MethodRangeRow[] = PAYMENT_METHODS.map((method) => {
    const advances    = r2(bySource.advances[method])
    const checkout    = r2(bySource.checkout[method])
    const coffee_shop = r2(bySource.coffee_shop[method])
    return { method, advances, checkout, coffee_shop, total: r2(advances + checkout + coffee_shop) }
  })

  const daily: MethodDailyRow[] = [...dailyMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, byMethod]) => ({
      date,
      byMethod: Object.fromEntries(
        PAYMENT_METHODS.map((m) => [m, r2(byMethod[m])]),
      ) as Record<PaymentMethod, number>,
      total: r2(PAYMENT_METHODS.reduce((s, m) => s + byMethod[m], 0)),
    }))

  const totals = {
    advances:    r2(rows.reduce((s, r) => s + r.advances, 0)),
    checkout:    r2(rows.reduce((s, r) => s + r.checkout, 0)),
    coffee_shop: r2(rows.reduce((s, r) => s + r.coffee_shop, 0)),
    total:       r2(rows.reduce((s, r) => s + r.total, 0)),
  }

  return { from: fromIso, to: toIso, rows, daily, totals }
}

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
