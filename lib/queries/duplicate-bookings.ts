import { createClient } from '@/lib/supabase/server'
import type { BookingStatus, PackageType } from '@/lib/supabase/types'

/**
 * Duplicate detection — used at quote create + booking convert time as a soft
 * warning, and by the Settings → Duplicate Bookings audit page.
 *
 * Status filter: we ignore `cancelled` and `draft` (drafts are user
 * scratch-space, cancelled rows are legitimately gone) but include `sent`,
 * `confirmed`, and `checked_out` because they all represent commitments.
 */

export interface DuplicateMatch {
  id:             string
  kind:           'quote' | 'booking'
  number:         string             // quote_number or booking_number
  status:         BookingStatus
  customer_name:  string
  customer_phone: string
  visit_date:     string
  check_out_date: string | null
  package_type:   PackageType
  total:          number
}

interface FindParams {
  phone:             string
  visit_date:        string
  package_type:      PackageType
  exclude_quote_id?:   string
  exclude_booking_id?: string
}

/** Normalises a phone string for comparison — strips spaces, dashes, leading +. */
function normalizePhone(p: string): string {
  return p.replace(/[\s\-()]/g, '').replace(/^\+/, '')
}

/**
 * Returns existing quotes/bookings that look like duplicates of the given
 * (phone, visit_date, package_type) tuple. Does NOT include the row whose id
 * matches the optional excludes (used when re-checking on edit).
 */
export async function findDuplicateBookings(params: FindParams): Promise<DuplicateMatch[]> {
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  const phoneNorm = normalizePhone(params.phone)

  // We over-fetch by visit_date + package_type and filter phone in JS so we
  // can use the normalisation helper consistently.
  const [quotesRes, bookingsRes] = await Promise.all([
    db.from('quotes')
      .select('id, quote_number, customer_name, customer_phone, visit_date, check_out_date, package_type, status, total')
      .eq('visit_date', params.visit_date)
      .eq('package_type', params.package_type)
      .not('status', 'in', '("cancelled","draft")'),
    db.from('bookings')
      .select('id, booking_number, customer_name, customer_phone, visit_date, check_out_date, package_type, status, total')
      .eq('visit_date', params.visit_date)
      .eq('package_type', params.package_type)
      .neq('status', 'cancelled'),
  ])

  const matches: DuplicateMatch[] = []

  for (const q of (quotesRes.data ?? []) as any[]) {
    if (params.exclude_quote_id && q.id === params.exclude_quote_id) continue
    if (normalizePhone(q.customer_phone) !== phoneNorm) continue
    matches.push({
      id:             q.id,
      kind:           'quote',
      number:         q.quote_number,
      status:         q.status,
      customer_name:  q.customer_name,
      customer_phone: q.customer_phone,
      visit_date:     q.visit_date,
      check_out_date: q.check_out_date,
      package_type:   q.package_type,
      total:          Number(q.total ?? 0),
    })
  }

  for (const b of (bookingsRes.data ?? []) as any[]) {
    if (params.exclude_booking_id && b.id === params.exclude_booking_id) continue
    if (normalizePhone(b.customer_phone) !== phoneNorm) continue
    matches.push({
      id:             b.id,
      kind:           'booking',
      number:         b.booking_number,
      status:         b.status,
      customer_name:  b.customer_name,
      customer_phone: b.customer_phone,
      visit_date:     b.visit_date,
      check_out_date: b.check_out_date,
      package_type:   b.package_type,
      total:          Number(b.total ?? 0),
    })
  }

  return matches
}

/* ─── Audit page support ───────────────────────────────────────────────── */

export interface DuplicateGroup {
  /** Stable key for React lists: phone|visit_date|package_type */
  key:            string
  customer_name:  string
  customer_phone: string
  visit_date:     string
  package_type:   PackageType
  bookings: Array<{
    id:             string
    booking_number: string
    status:         BookingStatus
    check_out_date: string | null
    total:          number
    advance_paid:   number
    remaining:      number
    created_at:     string
    /** Activity signals — used to identify the likely dupe vs the real one */
    charges_count:  number
    payments_count: number
    /** Status of the checkout row, if any (null = no checkout started) */
    checkout_status: 'draft' | 'finalized' | 'voided' | null
    /** True if this booking has zero activity AND a sibling has activity OR
     *  it was created after a sibling with equally-zero activity. */
    is_likely_dupe: boolean
  }>
}

/**
 * Returns all groups of bookings that look like duplicates. A "duplicate
 * group" = ≥ 2 non-cancelled bookings sharing (phone, visit_date, package_type).
 *
 * Single-tenant scale — pulls everything once and groups in JS.
 */
export async function findAllDuplicateGroups(): Promise<DuplicateGroup[]> {
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  const { data, error } = await db
    .from('bookings')
    .select(`
      id, booking_number, customer_name, customer_phone,
      visit_date, check_out_date, package_type, status,
      total, advance_paid, remaining, created_at
    `)
    .neq('status', 'cancelled')
    .order('visit_date', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(2000)
  if (error) throw new Error(`findAllDuplicateGroups: ${error.message}`)

  const groups = new Map<string, DuplicateGroup>()
  for (const b of (data ?? []) as any[]) {
    const phoneNorm = normalizePhone(b.customer_phone ?? '')
    const key = `${phoneNorm}|${b.visit_date}|${b.package_type}`
    let g = groups.get(key)
    if (!g) {
      g = {
        key,
        customer_name:  b.customer_name,
        customer_phone: b.customer_phone,
        visit_date:     b.visit_date,
        package_type:   b.package_type,
        bookings:       [],
      }
      groups.set(key, g)
    }
    g.bookings.push({
      id:             b.id,
      booking_number: b.booking_number,
      status:         b.status,
      check_out_date: b.check_out_date,
      total:          Number(b.total ?? 0),
      advance_paid:   Number(b.advance_paid ?? 0),
      remaining:      Number(b.remaining ?? 0),
      created_at:     b.created_at,
      // Filled in below
      charges_count:   0,
      payments_count:  0,
      checkout_status: null,
      is_likely_dupe:  false,
    })
  }

  // Keep only groups with ≥ 2 bookings
  const dupeGroups = Array.from(groups.values()).filter((g) => g.bookings.length >= 2)
  if (dupeGroups.length === 0) return []

  // Best-effort activity lookup. If checkout module isn't migrated, leave zeros.
  try {
    const allBookingIds = dupeGroups.flatMap((g) => g.bookings.map((b) => b.id))

    const { data: checkouts } = await db
      .from('checkouts')
      .select('id, booking_id, status')
      .in('booking_id', allBookingIds)

    const checkoutByBooking = new Map<string, { id: string; status: 'draft' | 'finalized' | 'voided' }>()
    const checkoutIds: string[] = []
    for (const c of (checkouts ?? []) as any[]) {
      checkoutByBooking.set(c.booking_id, { id: c.id, status: c.status })
      checkoutIds.push(c.id)
    }

    const chargesByCheckout  = new Map<string, number>()
    const paymentsByCheckout = new Map<string, number>()

    if (checkoutIds.length > 0) {
      const { data: chargeRows } = await db
        .from('checkout_charges').select('checkout_id').in('checkout_id', checkoutIds)
      for (const r of (chargeRows ?? []) as { checkout_id: string }[]) {
        chargesByCheckout.set(r.checkout_id, (chargesByCheckout.get(r.checkout_id) ?? 0) + 1)
      }
      const { data: paymentRows } = await db
        .from('checkout_payments').select('checkout_id').in('checkout_id', checkoutIds)
      for (const r of (paymentRows ?? []) as { checkout_id: string }[]) {
        paymentsByCheckout.set(r.checkout_id, (paymentsByCheckout.get(r.checkout_id) ?? 0) + 1)
      }
    }

    for (const g of dupeGroups) {
      for (const b of g.bookings) {
        const co = checkoutByBooking.get(b.id)
        if (co) {
          b.checkout_status = co.status
          b.charges_count   = chargesByCheckout.get(co.id)  ?? 0
          b.payments_count  = paymentsByCheckout.get(co.id) ?? 0
        }
      }
    }
  } catch { /* checkout tables not migrated — leave zeros */ }

  // Mark likely dupes per group:
  //  - A booking has "activity" if it has charges, payments, or a non-null checkout
  //  - If any booking in the group has activity → siblings without activity are likely dupes
  //  - If NO booking has activity → all but the earliest-created are likely dupes
  for (const g of dupeGroups) {
    const sorted = [...g.bookings].sort((a, b) => a.created_at.localeCompare(b.created_at))
    const hasActivity = (b: typeof g.bookings[number]) =>
      b.charges_count > 0 || b.payments_count > 0 || b.checkout_status !== null
    const anyActive = sorted.some(hasActivity)
    if (anyActive) {
      for (const b of g.bookings) {
        if (!hasActivity(b)) b.is_likely_dupe = true
      }
    } else {
      // None active — earliest survives, all later siblings are likely dupes
      const earliestId = sorted[0]?.id
      for (const b of g.bookings) {
        if (b.id !== earliestId) b.is_likely_dupe = true
      }
    }
  }

  return dupeGroups.sort((a, b) => b.visit_date.localeCompare(a.visit_date))
}
