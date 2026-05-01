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
    })
  }

  // Keep only groups with ≥ 2 bookings, newest first
  return Array.from(groups.values())
    .filter((g) => g.bookings.length >= 2)
    .sort((a, b) => b.visit_date.localeCompare(a.visit_date))
}
