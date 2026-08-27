import { createClient } from '@/lib/supabase/server'
import { isMissingRelation } from '@/lib/supabase/errors'
import { PAYMENT_METHODS, type PaymentMethod } from './income-by-method'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createClient() as any

export type TxnSource = 'advance' | 'checkout' | 'coffee_shop'

export const SOURCE_LABEL: Record<TxnSource, string> = {
  advance: 'Advance', checkout: 'Checkout', coffee_shop: 'Coffee shop',
}

export interface PaymentTransaction {
  id:          string
  source:      TxnSource
  /** Dhaka calendar date the money arrived. */
  date:        string
  /** 'HH:MM am/pm' Dhaka, or '' where the source records no time. */
  time:        string
  sortKey:     string
  method:      PaymentMethod
  amount:      number
  /** Destination account — which bank / wallet / terminal received it. */
  account:     string | null
  account_ref: string | null
  /** Transaction id, cheque number, POS slip. */
  reference:   string | null
  card_last4:  string | null
  /** Guest name, or the coffee-shop customer label. */
  party:       string | null
  /** Booking number or sale number — the document to pull. */
  document:    string | null
}

export interface PaymentTransactionsResult {
  from: string
  to:   string
  rows: PaymentTransaction[]
  /** Per destination account — what each statement should show. */
  byAccount: Array<{ account: string; account_ref: string | null; method: PaymentMethod | null; total: number; count: number }>
  total:     number
  /** True when migration 004 hasn't run — the account column reads '—'. */
  accountsMissing: boolean
}

const DHAKA_DAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit', day: '2-digit',
})
const DHAKA_TIME = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Dhaka', hour: 'numeric', minute: '2-digit', hour12: true,
})

const asMethod = (m: unknown): PaymentMethod =>
  (PAYMENT_METHODS as readonly string[]).includes(String(m)) ? (m as PaymentMethod) : 'other'

/**
 * Every individual payment the resort received in a range — one row per
 * transaction, not per bucket.
 *
 * This is the sheet accounts sits with beside a bank statement: each line
 * carries when it arrived, who paid, which document it belongs to, how it was
 * paid, WHERE it landed, and the reference printed on the slip. A statement
 * line that has no match here (or vice versa) is exactly the leak you are
 * looking for.
 */
export async function getPaymentTransactions(
  fromIso: string, toIso: string,
): Promise<PaymentTransactionsResult> {
  const startTs = `${fromIso}T00:00:00+06:00`
  const endExcl = new Date(`${toIso}T00:00:00+06:00`)
  endExcl.setDate(endExcl.getDate() + 1)
  const endTs = endExcl.toISOString()

  // Ask for the account join; retry without it when migration 004 hasn't run,
  // so the report degrades to method-only rather than failing.
  const withAccount = 'account:payment_accounts (display_name, account_ref, bank_name)'

  async function fetchWithFallback(
    table: string, columns: string, apply: (q: any) => any,   // eslint-disable-line @typescript-eslint/no-explicit-any
  ): Promise<{ rows: any[]; accountsMissing: boolean }> {     // eslint-disable-line @typescript-eslint/no-explicit-any
    const rich = await apply(db().from(table).select(`${columns}, ${withAccount}`))
    if (!rich.error) return { rows: rich.data ?? [], accountsMissing: false }
    if (!isMissingRelation(rich.error)) throw new Error(`[paymentTransactions.${table}] ${rich.error.message}`)
    const plain = await apply(db().from(table).select(columns))
    if (plain.error) throw new Error(`[paymentTransactions.${table}] ${plain.error.message}`)
    return { rows: plain.data ?? [], accountsMissing: true }
  }

  const [adv, co, cs] = await Promise.all([
    fetchWithFallback(
      'booking_advance_payments',
      'id, amount, method, paid_at, reference, booking:bookings (booking_number, customer_name)',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (q: any) => q.gte('paid_at', startTs).lt('paid_at', endTs).limit(5000),
    ).catch((err) => {
      // No ledger table at all — advances simply don't appear as transactions.
      if (isMissingRelation(err)) return { rows: [], accountsMissing: true }
      throw err
    }),
    fetchWithFallback(
      'checkout_payments',
      'id, amount, method, paid_at, reference, card_last4, checkout:checkouts (booking:bookings (booking_number, customer_name))',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (q: any) => q.gte('paid_at', startTs).lt('paid_at', endTs).limit(5000),
    ),
    fetchWithFallback(
      'coffee_shop_sale_payments',
      'id, amount, method, reference, card_last4, sale:coffee_shop_sales!inner (sale_number, customer_label, sale_date, status)',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (q: any) => q.eq('sale.status', 'completed')
        .gte('sale.sale_date', fromIso).lte('sale.sale_date', toIso).limit(5000),
    ),
  ])

  const accountsMissing = adv.accountsMissing || co.accountsMissing || cs.accountsMissing
  const rows: PaymentTransaction[] = []

  const accountOf = (r: any) => {   // eslint-disable-line @typescript-eslint/no-explicit-any
    if (!r.account) return { account: null, account_ref: null }
    const name = r.account.bank_name
      ? `${r.account.display_name} (${r.account.bank_name})`
      : r.account.display_name
    return { account: name as string, account_ref: (r.account.account_ref ?? null) as string | null }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const r of adv.rows as any[]) {
    const when = new Date(r.paid_at)
    rows.push({
      id: r.id, source: 'advance',
      date: DHAKA_DAY.format(when), time: DHAKA_TIME.format(when), sortKey: r.paid_at,
      method: asMethod(r.method), amount: Number(r.amount ?? 0),
      ...accountOf(r),
      reference: r.reference ?? null, card_last4: null,
      party:    r.booking?.customer_name ?? null,
      document: r.booking?.booking_number ?? null,
    })
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const r of co.rows as any[]) {
    const when = new Date(r.paid_at)
    const booking = r.checkout?.booking
    rows.push({
      id: r.id, source: 'checkout',
      date: DHAKA_DAY.format(when), time: DHAKA_TIME.format(when), sortKey: r.paid_at,
      method: asMethod(r.method), amount: Number(r.amount ?? 0),
      ...accountOf(r),
      reference: r.reference ?? null, card_last4: r.card_last4 ?? null,
      party:    booking?.customer_name ?? null,
      document: booking?.booking_number ?? null,
    })
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const r of cs.rows as any[]) {
    if (!r.sale || r.sale.status !== 'completed') continue
    rows.push({
      id: r.id, source: 'coffee_shop',
      // Coffee-shop tenders carry no per-row timestamp; the sale date is the day.
      date: r.sale.sale_date, time: '', sortKey: `${r.sale.sale_date}T23:59:59`,
      method: asMethod(r.method), amount: Number(r.amount ?? 0),
      ...accountOf(r),
      reference: r.reference ?? null, card_last4: r.card_last4 ?? null,
      party:    r.sale.customer_label ?? null,
      document: r.sale.sale_number ?? null,
    })
  }

  rows.sort((a, b) => a.sortKey.localeCompare(b.sortKey))

  // What each statement should add up to.
  const accMap = new Map<string, { account: string; account_ref: string | null; method: PaymentMethod | null; total: number; count: number }>()
  for (const r of rows) {
    const key = r.account ?? `__unassigned_${r.method}`
    const cur = accMap.get(key) ?? {
      account: r.account ?? `Unassigned — ${r.method}`,
      account_ref: r.account_ref, method: r.account ? null : r.method, total: 0, count: 0,
    }
    cur.total += r.amount
    cur.count += 1
    accMap.set(key, cur)
  }

  const round = (n: number) => Math.round(n * 100) / 100
  return {
    from: fromIso, to: toIso,
    rows: rows.map((r) => ({ ...r, amount: round(r.amount) })),
    byAccount: [...accMap.values()]
      .map((a) => ({ ...a, total: round(a.total) }))
      .sort((a, b) => b.total - a.total),
    total: round(rows.reduce((s, r) => s + r.amount, 0)),
    accountsMissing,
  }
}
