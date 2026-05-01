import { createClient } from '@/lib/supabase/server'
import type {
  CheckoutRow,
  CheckoutWithFull,
  CheckoutChargeWithRefs,
  CheckoutPaymentRow,
  BookingRow,
  CheckoutStatus,
} from '@/lib/supabase/types'

function coerceCheckout(r: any): CheckoutRow {
  return {
    ...r,
    advance_amount: Number(r.advance_amount ?? 0),
    charges_total:  Number(r.charges_total ?? 0),
    payments_total: Number(r.payments_total ?? 0),
    net_due:        Number(r.net_due ?? 0),
    refund_amount:  Number(r.refund_amount ?? 0),
  }
}

function coerceCharge(r: any): CheckoutChargeWithRefs {
  return {
    ...r,
    quantity:   Number(r.quantity ?? 0),
    unit_price: Number(r.unit_price ?? 0),
    amount:     Number(r.amount ?? 0),
  }
}

function coercePayment(r: any): CheckoutPaymentRow {
  return { ...r, amount: Number(r.amount ?? 0) }
}

export async function getCheckoutByBooking(bookingId: string): Promise<CheckoutRow | null> {
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any
  const { data } = await db
    .from('checkouts')
    .select('*')
    .eq('booking_id', bookingId)
    .maybeSingle()
  return data ? coerceCheckout(data) : null
}

export async function getChargesByCheckout(checkoutId: string): Promise<CheckoutChargeWithRefs[]> {
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any
  const { data, error } = await db
    .from('checkout_charges')
    .select(`
      *,
      category:charge_categories!inner (id, slug, display_name),
      charge_item:charge_items (id, name)
    `)
    .eq('checkout_id', checkoutId)
    .order('added_at', { ascending: true })
  if (error) throw new Error(`getChargesByCheckout: ${error.message}`)
  return (data ?? []).map(coerceCharge)
}

export async function getPaymentsByCheckout(checkoutId: string): Promise<CheckoutPaymentRow[]> {
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any
  const { data, error } = await db
    .from('checkout_payments')
    .select('*')
    .eq('checkout_id', checkoutId)
    .order('paid_at', { ascending: true })
  if (error) throw new Error(`getPaymentsByCheckout: ${error.message}`)
  return (data ?? []).map(coercePayment)
}

/**
 * Full join used by /checkout/[bookingId] and the PDF invoice route.
 */
export async function getCheckoutFull(bookingId: string): Promise<CheckoutWithFull | null> {
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  const { data: booking } = await db
    .from('bookings')
    .select('*')
    .eq('id', bookingId)
    .maybeSingle()
  if (!booking) return null

  const { data: checkout } = await db
    .from('checkouts')
    .select('*')
    .eq('booking_id', bookingId)
    .maybeSingle()
  if (!checkout) return null

  const [charges, payments] = await Promise.all([
    getChargesByCheckout(checkout.id),
    getPaymentsByCheckout(checkout.id),
  ])

  return {
    ...coerceCheckout(checkout),
    booking: booking as BookingRow,
    charges,
    payments,
  }
}

/**
 * Used by the booking detail Charges tab. Returns the existing draft if any,
 * otherwise null. The action layer creates one lazily on first charge add.
 */
export async function getDraftCheckoutForBooking(bookingId: string): Promise<CheckoutRow | null> {
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any
  const { data } = await db
    .from('checkouts')
    .select('*')
    .eq('booking_id', bookingId)
    .eq('status', 'draft')
    .maybeSingle()
  return data ? coerceCheckout(data) : null
}

/**
 * For the /checkout list page — returns all bookings in the relevant set,
 * optionally filtered by status. Result rows include the matching checkout
 * row (if any) so the list can show status, totals, etc.
 */
export interface CheckoutListRow {
  booking_id:    string
  booking_number: string
  customer_name:  string
  customer_phone: string
  visit_date:     string
  check_out_date: string | null
  package_type:   'daylong' | 'night'
  total:          number
  advance_paid:   number
  remaining:      number
  booking_status: 'draft' | 'sent' | 'confirmed' | 'cancelled' | 'checked_out'
  checkout: CheckoutRow | null
}

export async function listCheckoutCandidates(opts: {
  filter?: 'today' | 'drafts' | 'finalized' | 'all'
} = {}): Promise<CheckoutListRow[]> {
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  const today = new Date().toISOString().slice(0, 10)
  const thirtyDaysAgoIso = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString().slice(0, 10)

  // Pull all confirmed/checked-out bookings whose stay overlaps today or recent past.
  // We over-fetch slightly and filter in JS — list size is small (single resort).
  const { data: bookings } = await db
    .from('bookings')
    .select(`
      id, booking_number, customer_name, customer_phone, visit_date, check_out_date,
      package_type, total, advance_paid, remaining, status
    `)
    .in('status', ['confirmed', 'checked_out'])
    .gte('visit_date', thirtyDaysAgoIso)
    .order('visit_date', { ascending: false })
    .limit(200)

  const ids = (bookings ?? []).map((b: any) => b.id) as string[]
  const checkoutsByBooking = new Map<string, CheckoutRow>()
  if (ids.length > 0) {
    const { data: checkoutRows } = await db.from('checkouts').select('*').in('booking_id', ids)
    for (const c of (checkoutRows ?? []) as any[]) {
      checkoutsByBooking.set(c.booking_id, coerceCheckout(c))
    }
  }

  const rows: CheckoutListRow[] = (bookings ?? []).map((b: any) => {
    const c = checkoutsByBooking.get(b.id) ?? null
    // Override DB-generated net_due with the corrected formula that includes booking.total.
    // For drafts, advance_amount may not be snapshotted yet → use the live advance_paid.
    if (c) {
      const bookingTotal = Number(b.total ?? 0)
      const advance = c.status === 'finalized' ? c.advance_amount : Number(b.advance_paid ?? 0)
      c.net_due = Math.round(
        (bookingTotal + c.charges_total - advance - c.payments_total) * 100,
      ) / 100
    }
    return {
      booking_id:     b.id,
      booking_number: b.booking_number,
      customer_name:  b.customer_name,
      customer_phone: b.customer_phone,
      visit_date:     b.visit_date,
      check_out_date: b.check_out_date,
      package_type:   b.package_type,
      total:          Number(b.total ?? 0),
      advance_paid:   Number(b.advance_paid ?? 0),
      remaining:      Number(b.remaining ?? 0),
      booking_status: b.status,
      checkout:       c,
    }
  })

  function effectiveCheckOutDate(r: CheckoutListRow): string {
    return r.check_out_date ?? r.visit_date   // daylong → visit_date IS check-out
  }

  switch (opts.filter ?? 'today') {
    case 'today':
      return rows.filter((r) => effectiveCheckOutDate(r) === today && r.checkout?.status !== 'finalized')
    case 'drafts':
      return rows.filter((r) => r.checkout?.status === 'draft')
    case 'finalized':
      return rows.filter((r) => r.checkout?.status === 'finalized')
    case 'all':
    default:
      return rows
  }
}

export async function getRecentFinalizedCount(): Promise<number> {
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any
  const { count } = await db
    .from('checkouts')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'finalized')
  return count ?? 0
}

export type { CheckoutStatus }
