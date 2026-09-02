import { createClient } from '@/lib/supabase/server'
import { sanitizeSearch } from '@/lib/utils'
import type { BookingWithRooms, BookingStatus, GroupDayWithRooms } from '@/lib/supabase/types'

export interface BookingFilters {
  status?:    BookingStatus
  search?:    string
  from_date?: string
  to_date?:   string
  corporate?: boolean   // when true, returns only corporate bookings
  limit?:     number
  offset?:    number
  /** visit_date sort. Use 'desc' + limit for "the N most recent" — an
   *  ascending capped fetch keeps the OLDEST rows, so new bookings silently
   *  vanish from the result once the table outgrows the cap. */
  order?:     'asc' | 'desc'
}

/**
 * Columns actually rendered by booking lists (`/bookings`, dashboard
 * "upcoming"). The big jsonb fields — `line_items`, `extra_items` — are
 * intentionally omitted because they're only needed on the detail page and
 * inflate the list payload significantly. `package_snapshot` is kept because
 * the list page reads `.name` for filtering. If you need a list helper that
 * returns the full row, add a separate function rather than widening this.
 */
const BOOKING_LIST_COLUMNS = `
  id, booking_number, quote_id, customer_name, customer_phone,
  package_type, visit_date, check_out_date, nights,
  adults, children_paid, children_free, drivers, extra_beds,
  subtotal, discount, discount_pct, service_charge_pct,
  total, advance_required, advance_paid, due_advance, remaining,
  status, sales_employee_id, is_corporate, company_name, corporate_account_id,
  package_snapshot,
  created_at, updated_at,
  booking_rooms(*)
`

/** Fetch bookings with their rooms (list view — line_items/extra_items omitted) */
export async function getBookings(filters: BookingFilters = {}): Promise<BookingWithRooms[]> {
  const supabase = createClient()
  // booking_number is the deterministic tiebreaker — without it Postgres can
  // reorder rows that share the same visit_date across requests, which made
  // bookings appear/disappear from a limited list non-deterministically.
  const ascending = (filters.order ?? 'asc') === 'asc'
  let query = supabase
    .from('bookings')
    .select(BOOKING_LIST_COLUMNS)
    .order('visit_date',     { ascending })
    .order('booking_number', { ascending })

  if (filters.status) query = query.eq('status', filters.status)
  if (filters.corporate) query = query.eq('is_corporate', true)
  if (filters.from_date) query = query.gte('visit_date', filters.from_date)
  if (filters.to_date) query = query.lte('visit_date', filters.to_date)
  if (filters.search) {
    const term = sanitizeSearch(filters.search)   // commas/parens are .or() syntax and used to break the query
    if (term) query = query.or(
      `customer_name.ilike.%${term}%,customer_phone.ilike.%${term}%,booking_number.ilike.%${term}%`,
    )
  }
  if (filters.limit) query = query.limit(filters.limit)

  const { data, error } = await query
  if (error) throw new Error(`getBookings: ${error.message}`)
  return (data ?? []).map((b: any) => ({ ...b, rooms: b.booking_rooms ?? [] }))
}

/** Fetch a single booking with its rooms */
export async function getBookingById(id: string): Promise<BookingWithRooms | null> {
  const supabase = createClient()
  const { data: booking, error } = await supabase
    .from('bookings')
    .select('*')
    .eq('id', id)
    .single()
  if (error || !booking) return null

  const { data: rooms } = await supabase
    .from('booking_rooms')
    .select('*')
    .eq('booking_id', id)

  // A group's rooms and guests live in its itinerary, not in booking_rooms.
  if ((booking as { package_type?: string }).package_type === 'group') {
    const { data: days } = await (supabase as any)  // eslint-disable-line @typescript-eslint/no-explicit-any
      .from('booking_days')
      .select('*, rooms:booking_day_rooms(*)')
      .eq('booking_id', id)
    return { ...booking, rooms: rooms ?? [], days: sortDays((days ?? []) as GroupDayWithRooms[]) }
  }

  return { ...booking, rooms: rooms ?? [] }
}

/** Itinerary rows → sorted days-with-rooms. Night before day on the same date. */
function sortDays<T extends { day_date: string; stay_kind: string }>(days: T[]): T[] {
  return [...days].sort((a, b) =>
    a.day_date.localeCompare(b.day_date)
    || (a.stay_kind === b.stay_kind ? 0 : a.stay_kind === 'night' ? -1 : 1))
}

/** Get upcoming confirmed bookings */
export async function getUpcomingBookings(limit = 5): Promise<BookingWithRooms[]> {
  const today = new Date().toISOString().split('T')[0]
  return getBookings({ status: 'confirmed', from_date: today, limit })
}

/** Get booking total revenue (for dashboard).
 *  `pending_advance` correctly accounts for checkout-time payments + checkout
 *  discounts via the same per-booking math as `lib/checkout/totals.ts::calcNetDue`,
 *  rather than summing the DB-generated `bookings.remaining` (which is just
 *  `total - advance_paid` and doesn't see checkout payments).
 *
 *  Aggregation happens in the get_booking_stats() RPC (single row back,
 *  immune to the PostgREST 1000-row response cap). Falls back to the legacy
 *  app-side aggregation if the RPC migration hasn't been run yet. */
export async function getBookingStats(): Promise<{
  total_bookings: number
  total_revenue: number
  pending_advance: number
}> {
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rpcData, error: rpcError } = await (supabase as any).rpc('get_booking_stats')
  if (!rpcError && rpcData) {
    const row = Array.isArray(rpcData) ? rpcData[0] : rpcData
    if (row) {
      return {
        total_bookings:  Number(row.total_bookings ?? 0),
        total_revenue:   Number(row.total_revenue ?? 0),
        pending_advance: Number(row.pending_advance ?? 0),
      }
    }
  }

  // Legacy fallback — only correct below the 1000-row PostgREST cap.
  const { data } = await supabase
    .from('bookings')
    .select(`
      total, advance_paid, status,
      checkout:checkouts (
        status, discount_amount,
        payments:checkout_payments (amount)
      )
    `)
    .neq('status', 'cancelled')

  const total_bookings = data?.length ?? 0
  let total_revenue = 0
  let pending_advance = 0
  for (const row of (data ?? []) as any[]) {  // eslint-disable-line @typescript-eslint/no-explicit-any
    const advance     = Number(row.advance_paid ?? 0)
    // No-show: the guest never came, so the room total is uncollectible —
    // only the non-refundable advance counts as revenue, and there's no
    // pending balance to chase. Mirrors the RPC math.
    if (row.status === 'no_show') {
      total_revenue += advance
      continue
    }
    total_revenue += Number(row.total ?? 0)
    const co          = Array.isArray(row.checkout) ? row.checkout[0] : row.checkout
    const isFinal     = co?.status === 'finalized'
    const coDiscount  = isFinal ? Number(co.discount_amount ?? 0) : 0
    const coPayments  = isFinal
      ? ((co.payments ?? []) as Array<{ amount: number }>).reduce((s, p) => s + Number(p.amount ?? 0), 0)
      : 0
    pending_advance += Math.max(0, Number(row.total ?? 0) - coDiscount - advance - coPayments)
  }
  return { total_bookings, total_revenue, pending_advance }
}

/** Get revenue stats for a date range with optional package type filter */
export async function getRevenueStats(params: {
  from_date: string
  to_date:   string
  type?:     'daylong' | 'night' | 'all'
}): Promise<{
  booking_count:   number
  total_revenue:   number
  collected:       number
  outstanding:     number
}> {
  const supabase = createClient()
  let query = supabase
    .from('bookings')
    .select('total, advance_paid, remaining, package_type')
    .neq('status', 'cancelled')
    .gte('visit_date', params.from_date)
    .lte('visit_date', params.to_date)

  if (params.type && params.type !== 'all') {
    query = query.eq('package_type', params.type)
  }

  const { data } = await query
  const rows = data ?? []
  return {
    booking_count: rows.length,
    total_revenue:  rows.reduce((s, b) => s + (b.total ?? 0), 0),
    collected:      rows.reduce((s, b) => s + (b.advance_paid ?? 0), 0),
    outstanding:    rows.reduce((s, b) => s + (b.remaining ?? 0), 0),
  }
}
