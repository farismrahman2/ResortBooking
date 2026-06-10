import { createClient } from '@/lib/supabase/server'
import type {
  QuoteRow,
  QuoteRoomRow,
  QuoteWithRooms,
  BookingWithRooms,
  BookingStatus,
} from '@/lib/supabase/types'
import { getBookingById } from '@/lib/queries/bookings'

export interface QuoteFilters {
  status?:       BookingStatus
  search?:       string    // customer name or phone
  from_date?:    string
  to_date?:      string
  limit?:        number
  offset?:       number
}

/**
 * Columns actually rendered by quote lists (`/quotes`, dashboard "recent").
 * Heavy jsonb (`line_items`, `extra_items`, `package_snapshot`) is omitted —
 * they're only needed on the detail / edit / print pages and inflate the
 * list payload substantially. Use `getQuoteById` when you need the full row.
 */
const QUOTE_LIST_COLUMNS = `
  id, quote_number, customer_name, customer_phone,
  package_type, visit_date, check_out_date, nights,
  adults, children_paid, children_free, drivers, extra_beds,
  subtotal, discount, discount_pct, service_charge_pct,
  total, advance_required, advance_paid, due_advance, remaining,
  status, converted_to_booking_id, sales_employee_id,
  created_at, updated_at
`

/** Fetch quotes with optional filters (list view — heavy jsonb omitted) */
export async function getQuotes(filters: QuoteFilters = {}): Promise<QuoteRow[]> {
  const supabase = createClient()
  let query = supabase
    .from('quotes')
    .select(QUOTE_LIST_COLUMNS)
    .order('created_at', { ascending: false })

  if (filters.status) query = query.eq('status', filters.status)
  if (filters.from_date) query = query.gte('visit_date', filters.from_date)
  if (filters.to_date) query = query.lte('visit_date', filters.to_date)
  if (filters.search) {
    query = query.or(
      `customer_name.ilike.%${filters.search}%,customer_phone.ilike.%${filters.search}%,quote_number.ilike.%${filters.search}%`,
    )
  }
  if (filters.limit) query = query.limit(filters.limit)
  if (filters.offset) query = query.range(filters.offset, (filters.offset ?? 0) + (filters.limit ?? 50) - 1)

  const { data, error } = await query
  if (error) throw new Error(`getQuotes: ${error.message}`)
  // Custom select returns a partial QuoteRow shape (no jsonb cols); list
  // consumers don't read those fields, so we cast through unknown.
  return (data ?? []) as unknown as QuoteRow[]
}

/** Fetch a single quote with its rooms */
export async function getQuoteById(id: string): Promise<QuoteWithRooms | null> {
  const supabase = createClient()
  const { data: quote, error } = await supabase
    .from('quotes')
    .select('*')
    .eq('id', id)
    .single()
  if (error || !quote) return null

  const { data: rooms } = await supabase
    .from('quote_rooms')
    .select('*')
    .eq('quote_id', id)

  return { ...quote, rooms: rooms ?? [] }
}

/**
 * Fetch a quote for display, overlaying the linked booking's mutable fields
 * (rooms, line_items, totals, guest counts, dates, customer_notes,
 * package_snapshot) when a booking exists. Identity fields — id, quote_number,
 * status, converted_to_booking_id, sales_employee_id, created_at, updated_at —
 * always come from the quote. Use this on read-only quote surfaces so that
 * edits made post-conversion (e.g. removing a room from the booking) don't
 * leave the quote view stale.
 */
export async function getEffectiveQuoteForDisplay(
  id: string,
): Promise<QuoteWithRooms | null> {
  const quote = await getQuoteById(id)
  if (!quote || !quote.converted_to_booking_id) return quote

  const booking = await getBookingById(quote.converted_to_booking_id)
  if (!booking) return quote

  return overlayBookingOntoQuote(quote, booking)
}

function overlayBookingOntoQuote(
  quote: QuoteWithRooms,
  booking: BookingWithRooms,
): QuoteWithRooms {
  const rooms: QuoteRoomRow[] = booking.rooms.map((r) => ({
    id:           r.id,
    quote_id:     quote.id,
    room_type:    r.room_type,
    qty:          r.qty,
    unit_price:   r.unit_price,
    room_numbers: r.room_numbers,
  }))

  return {
    ...quote,
    customer_name:      booking.customer_name,
    customer_phone:     booking.customer_phone,
    customer_notes:     booking.customer_notes,
    package_type:       booking.package_type,
    package_snapshot:   booking.package_snapshot,
    visit_date:         booking.visit_date,
    check_out_date:     booking.check_out_date,
    nights:             booking.nights,
    adults:             booking.adults,
    children_paid:      booking.children_paid,
    children_free:      booking.children_free,
    drivers:            booking.drivers,
    extra_beds:         booking.extra_beds,
    subtotal:           booking.subtotal,
    discount:           booking.discount,
    discount_pct:       booking.discount_pct,
    service_charge_pct: booking.service_charge_pct,
    total:              booking.total,
    advance_required:   booking.advance_required,
    advance_paid:       booking.advance_paid,
    due_advance:        booking.due_advance,
    remaining:          booking.remaining,
    line_items:         booking.line_items,
    extra_items:        booking.extra_items,
    rooms,
  }
}

/** Get quote count by status (for dashboard).
 *  Head-only count queries: no rows transferred, and immune to the PostgREST
 *  1000-row response cap (which silently undercounted past 1000 quotes). */
export async function getQuoteStatusCounts(): Promise<Record<BookingStatus, number>> {
  const supabase = createClient()
  const statuses: BookingStatus[] = ['draft', 'sent', 'confirmed', 'cancelled']
  const results = await Promise.all(
    statuses.map((status) =>
      supabase.from('quotes').select('id', { count: 'exact', head: true }).eq('status', status),
    ),
  )
  const counts = {} as Record<BookingStatus, number>
  statuses.forEach((status, i) => { counts[status] = results[i].count ?? 0 })
  return counts
}

/** Get recent quotes for dashboard */
export async function getRecentQuotes(limit = 5): Promise<QuoteRow[]> {
  return getQuotes({ limit })
}
