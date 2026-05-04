import { createClient } from '@/lib/supabase/server'
import type { BookingWithRooms, BookingStatus } from '@/lib/supabase/types'

export interface BookingFilters {
  status?:    BookingStatus
  search?:    string
  from_date?: string
  to_date?:   string
  limit?:     number
  offset?:    number
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
  status, sales_employee_id, package_snapshot,
  created_at, updated_at,
  booking_rooms(*)
`

/** Fetch bookings with their rooms (list view — line_items/extra_items omitted) */
export async function getBookings(filters: BookingFilters = {}): Promise<BookingWithRooms[]> {
  const supabase = createClient()
  // booking_number is the deterministic tiebreaker — without it Postgres can
  // reorder rows that share the same visit_date across requests, which made
  // bookings appear/disappear from a limited list non-deterministically.
  let query = supabase
    .from('bookings')
    .select(BOOKING_LIST_COLUMNS)
    .order('visit_date',     { ascending: true })
    .order('booking_number', { ascending: true })

  if (filters.status) query = query.eq('status', filters.status)
  if (filters.from_date) query = query.gte('visit_date', filters.from_date)
  if (filters.to_date) query = query.lte('visit_date', filters.to_date)
  if (filters.search) {
    query = query.or(
      `customer_name.ilike.%${filters.search}%,customer_phone.ilike.%${filters.search}%,booking_number.ilike.%${filters.search}%`,
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

  return { ...booking, rooms: rooms ?? [] }
}

/** Get upcoming confirmed bookings */
export async function getUpcomingBookings(limit = 5): Promise<BookingWithRooms[]> {
  const today = new Date().toISOString().split('T')[0]
  return getBookings({ status: 'confirmed', from_date: today, limit })
}

/** Get booking total revenue (for dashboard) */
export async function getBookingStats(): Promise<{
  total_bookings: number
  total_revenue: number
  pending_advance: number
}> {
  const supabase = createClient()
  const { data } = await supabase
    .from('bookings')
    .select('total, remaining')
    .neq('status', 'cancelled')

  const total_bookings = data?.length ?? 0
  const total_revenue = data?.reduce((sum, b) => sum + (b.total ?? 0), 0) ?? 0
  const pending_advance = data?.reduce((sum, b) => sum + (b.remaining ?? 0), 0) ?? 0
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
