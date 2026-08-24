import { createClient } from '@/lib/supabase/server'
import { checkRoomAvailability } from '@/lib/engine/availability'
import { nextDay } from '@/lib/config/rooms'
import type { AvailabilityResult, RoomInventoryRow, RoomType } from '@/lib/supabase/types'
import type { OccupiedRoom } from '@/lib/engine/availability'

// ─── Shared availability conflict check ──────────────────────────────────────

/**
 * Check if requested rooms are available across every night in [visitDate, checkOutDate).
 * For daylong, only checks the single visit date.
 * Optionally excludes a booking from the occupancy count (for date-change scenarios).
 * Optionally excludes a quote (for re-checking at conversion time, where the quote
 * being converted shouldn't conflict with itself).
 * Returns a human-readable conflict message, or null if all clear.
 */
export async function checkAvailabilityConflict(
  visitDate: string,
  checkOutDate: string | null,
  requestedRooms: { room_type: string; qty: number }[],
  excludeBookingId?: string,
  excludeQuoteId?: string,
): Promise<string | null> {
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  // Build list of dates to check
  const dates: string[] = []
  if (!checkOutDate) {
    dates.push(visitDate)
  } else {
    const cur = new Date(visitDate + 'T00:00:00')
    const end = new Date(checkOutDate + 'T00:00:00')
    while (cur < end) {
      dates.push(cur.toISOString().slice(0, 10))
      cur.setDate(cur.getDate() + 1)
    }
  }

  // One bounded fetch for the whole [rangeStart, rangeEnd) window, then per-date
  // sums in memory. This used to run two queries per night with only an upper
  // date bound — every historical row matched, and past PostgREST's 1000-row
  // response cap current bookings silently fell out of the occupancy sum, so
  // the capacity guard approved overbookings.
  //
  // A booking blocks [visit_date, check_out_date), or just visit_date when
  // check_out_date is null (daylong). It overlaps the window iff
  // visit_date < rangeEnd AND (check_out_date > rangeStart OR
  // (check_out_date IS NULL AND visit_date >= rangeStart)).
  const rangeStart = visitDate
  const rangeEnd   = checkOutDate ?? nextDay(visitDate)
  const overlapOr  = `check_out_date.gt.${rangeStart},and(check_out_date.is.null,visit_date.gte.${rangeStart})`

  let bookingQuery = db
    .from('booking_rooms')
    .select('room_type, qty, bookings!inner(id, visit_date, check_out_date, status)')
    .lt('bookings.visit_date', rangeEnd)
    .or(overlapOr, { foreignTable: 'bookings' })
    .neq('bookings.status', 'cancelled')

  if (excludeBookingId) {
    bookingQuery = bookingQuery.neq('bookings.id', excludeBookingId)
  }

  let quoteQuery = db
    .from('quote_rooms')
    .select('room_type, qty, quotes!inner(id, visit_date, check_out_date, status, converted_to_booking_id)')
    .lt('quotes.visit_date', rangeEnd)
    .or(overlapOr, { foreignTable: 'quotes' })
    .eq('quotes.status', 'confirmed')
    .is('quotes.converted_to_booking_id', null)

  if (excludeQuoteId) {
    quoteQuery = quoteQuery.neq('quotes.id', excludeQuoteId)
  }

  const [{ data: inventory }, { data: bookingOccupied }, { data: quoteOccupied }] =
    await Promise.all([
      db.from('room_inventory').select('room_type, total_units'),
      bookingQuery,
      quoteQuery,
    ])

  for (const date of dates) {
    // Sum occupied units per room type on this date
    const occupied = new Map<string, number>()
    for (const row of bookingOccupied ?? []) {
      const b = (row as any).bookings
      // Defensive guard: the embedded .neq('bookings.status', 'cancelled')
      // filter doesn't reliably cascade to the parent rows under !inner in
      // every PostgREST version, so cancelled bookings can slip through.
      // no_show frees the room same as cancelled — the advance was paid but
      // the guest never arrived, so the inventory is back on the market.
      if (!b || b.status === 'cancelled' || b.status === 'no_show') continue
      // visit_date <= date used to be guaranteed by the (per-date) query; now
      // the fetch spans the whole window, so it must be checked here.
      const blocks = b.visit_date <= date
        && (b.check_out_date ? b.check_out_date > date : b.visit_date === date)
      if (blocks) {
        occupied.set(row.room_type, (occupied.get(row.room_type) ?? 0) + row.qty)
      }
    }
    for (const row of quoteOccupied ?? []) {
      const q = (row as any).quotes
      // Same defensive guard as bookings — only confirmed, unconverted quotes block.
      if (!q || q.status !== 'confirmed' || q.converted_to_booking_id) continue
      const blocks = q.visit_date <= date
        && (q.check_out_date ? q.check_out_date > date : q.visit_date === date)
      if (blocks) {
        occupied.set(row.room_type, (occupied.get(row.room_type) ?? 0) + row.qty)
      }
    }

    // Check each requested room
    for (const req of requestedRooms) {
      const totalUnits = (inventory ?? []).find((r: any) => r.room_type === req.room_type)?.total_units ?? 0
      const alreadyBooked = occupied.get(req.room_type) ?? 0
      const available = totalUnits - alreadyBooked
      if (req.qty > available) {
        return `${req.room_type.replace(/_/g, ' ')} is unavailable on ${date} (${available} of ${totalUnits} remaining, ${req.qty} requested)`
      }
    }
  }

  return null
}

/** Get room availability for a single date */
export async function getRoomAvailability(
  date: string,   // ISO date
  inventory: RoomInventoryRow[],
  packageType?: 'daylong' | 'night',
): Promise<AvailabilityResult[]> {
  const supabase = createClient()

  // Overlap bound pushed to SQL: without the .or() the only predicate was
  // visit_date <= date, which matches every historical row and silently
  // truncates at PostgREST's 1000-row cap once the resort has enough history.
  const dayOverlapOr = `check_out_date.gt.${date},and(check_out_date.is.null,visit_date.eq.${date})`

  const [{ data: bookingOccupied }, { data: quoteOccupied }] = await Promise.all([
    supabase
      .from('booking_rooms')
      .select('room_type, qty, bookings!inner(visit_date, check_out_date, status)')
      .filter('bookings.visit_date', 'lte', date)
      .or(dayOverlapOr, { foreignTable: 'bookings' })
      .filter('bookings.status', 'neq', 'cancelled'),
    // Confirmed quotes that overlap, excluding ones already converted to a
    // booking (they'd be double-counted).
    supabase
      .from('quote_rooms')
      .select('room_type, qty, quotes!inner(visit_date, check_out_date, status, converted_to_booking_id)')
      .filter('quotes.visit_date', 'lte', date)
      .or(dayOverlapOr, { foreignTable: 'quotes' })
      .eq('quotes.status', 'confirmed')
      .is('quotes.converted_to_booking_id', null),
  ])

  // Merge and filter by actual date overlap
  const occupied: OccupiedRoom[] = []

  for (const row of bookingOccupied ?? []) {
    const booking = (row as any).bookings
    if (!booking || booking.status === 'cancelled' || booking.status === 'no_show') continue
    const checkOut = booking.check_out_date ?? booking.visit_date
    // Inclusive of visit_date, exclusive of check_out_date
    if (booking.visit_date <= date && (booking.check_out_date ? booking.check_out_date > date : booking.visit_date === date)) {
      occupied.push({ room_type: row.room_type as RoomType, qty_booked: row.qty })
    }
  }

  for (const row of quoteOccupied ?? []) {
    const quote = (row as any).quotes
    if (quote.visit_date <= date && (quote.check_out_date ? quote.check_out_date > date : quote.visit_date === date)) {
      occupied.push({ room_type: row.room_type as RoomType, qty_booked: row.qty })
    }
  }

  return checkRoomAvailability(inventory, occupied, packageType)
}

/** Get availability for a date range using the Supabase RPC */
export async function getAvailabilityRange(
  from: string,   // ISO date
  to: string,     // ISO date
  inventory: RoomInventoryRow[],
): Promise<Map<string, AvailabilityResult[]>> {
  const supabase = createClient()

  const { data, error } = await supabase.rpc('get_availability_range', {
    p_from: from,
    p_to: to,
  })

  if (error) {
    console.error('get_availability_range RPC error:', error)
    // Fall back to single-date queries
    const result = new Map<string, AvailabilityResult[]>()
    return result
  }

  // Group by date
  const byDate = new Map<string, OccupiedRoom[]>()
  for (const row of data ?? []) {
    const dateStr = row.check_date
    const existing = byDate.get(dateStr) ?? []
    existing.push({ room_type: row.check_room_type, qty_booked: Number(row.qty_booked) })
    byDate.set(dateStr, existing)
  }

  // Compute availability for each date
  const result = new Map<string, AvailabilityResult[]>()
  for (const [date, occupied] of byDate) {
    result.set(date, checkRoomAvailability(inventory, occupied))
  }

  return result
}

export interface DayGuestCounts {
  bookings:        number
  adults:          number
  children:        number
  drivers:         number
  guests:          number   // adults + children
  daylong_bookings: number
  daylong_guests:   number
  night_bookings:   number
  night_guests:     number
  arriving:         number  // bookings whose visit_date IS this date
}

/**
 * Everyone on site on a given date: daylong bookings on the day plus night
 * stays covering that night ([visit_date, check_out_date) — the checkout-
 * morning crowd has left by the time the day's guests arrive). Cancelled and
 * no-show excluded. Powers the tap-a-date summary on the availability page.
 */
export async function getGuestsOnDate(date: string): Promise<DayGuestCounts> {
  const supabase = createClient()
  const { data, error } = await (supabase as any)  // eslint-disable-line @typescript-eslint/no-explicit-any
    .from('bookings')
    .select('package_type, visit_date, check_out_date, status, adults, children_paid, children_free, drivers')
    .not('status', 'in', '(cancelled,no_show)')
    .lte('visit_date', date)
    .or(`check_out_date.gt.${date},and(check_out_date.is.null,visit_date.eq.${date})`)
  if (error) throw new Error(`getGuestsOnDate: ${error.message}`)

  const out: DayGuestCounts = {
    bookings: 0, adults: 0, children: 0, drivers: 0, guests: 0,
    daylong_bookings: 0, daylong_guests: 0, night_bookings: 0, night_guests: 0,
    arriving: 0,
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const b of ((data ?? []) as any[])) {
    const covers = b.check_out_date
      ? b.visit_date <= date && b.check_out_date > date
      : b.visit_date === date
    if (!covers) continue
    const adults   = Number(b.adults ?? 0)
    const children = Number(b.children_paid ?? 0) + Number(b.children_free ?? 0)
    out.bookings += 1
    out.adults   += adults
    out.children += children
    out.drivers  += Number(b.drivers ?? 0)
    out.guests   += adults + children
    if (b.package_type === 'daylong') { out.daylong_bookings += 1; out.daylong_guests += adults + children }
    else                              { out.night_bookings += 1;   out.night_guests += adults + children }
    if (b.visit_date === date) out.arriving += 1
  }
  return out
}

/**
 * Return all room numbers that are already assigned in other bookings whose date
 * range overlaps [visitDate, checkOutDate). Pass excludeBookingId to exclude the
 * current booking being edited.
 */
export async function getBookedRoomNumbers(
  visitDate:        string,
  checkOutDate:     string | null,
  excludeBookingId?: string,
): Promise<string[]> {
  const supabase = createClient()

  const aStart = visitDate
  const aEnd   = checkOutDate ?? nextDay(visitDate)

  // The overlap window is pushed into the query. Unbounded, this fetched every
  // booking_rooms row ever created; past PostgREST's 1000-row cap an active
  // overlapping booking could silently drop out of the result — and every
  // room-number conflict guard in the app trusts this list, so the same
  // physical room could be assigned to two bookings.
  let query = supabase
    .from('booking_rooms')
    .select('room_numbers, bookings!inner(id, visit_date, check_out_date, status)')
    .lt('bookings.visit_date', aEnd)
    .or(`check_out_date.gt.${aStart},and(check_out_date.is.null,visit_date.gte.${aStart})`, { foreignTable: 'bookings' })
    .neq('bookings.status', 'cancelled')

  if (excludeBookingId) {
    query = query.neq('bookings.id', excludeBookingId)
  }

  const { data } = await query

  const taken: string[] = []
  for (const row of data ?? []) {
    const b = (row as any).bookings
    if (!b || b.status === 'cancelled' || b.status === 'no_show') continue
    const bStart = b.visit_date
    const bEnd   = b.check_out_date ?? nextDay(b.visit_date)
    // Overlap check: [aStart, aEnd) ∩ [bStart, bEnd) ≠ ∅
    if (aStart < bEnd && bStart < aEnd) {
      taken.push(...((row as any).room_numbers ?? []))
    }
  }

  return taken
}

/**
 * Room-number availability split into two buckets for the quote/booking UI.
 *
 *  - `taken`: rooms occupied for the whole requested period (render red — not selectable).
 *  - `noon`:  rooms whose previous night guest checks out ON the visit date, so the
 *             room is free only after the ~noon checkout. Daylong visits only
 *             (checkOutDate == null). Render yellow — selectable, with a caveat.
 *
 * `taken` reuses getBookedRoomNumbers so it stays identical to the rest of the app.
 * `noon` additionally considers confirmed (unconverted) quotes, mirroring the
 * /api/room-noon-notice logic.
 */
export async function getRoomNumberAvailability(
  visitDate:        string,
  checkOutDate:     string | null,
  excludeBookingId?: string,
): Promise<{ taken: string[]; noon: string[] }> {
  const taken = await getBookedRoomNumbers(visitDate, checkOutDate, excludeBookingId)

  // Noon turnover only applies to daylong visits. For a night range the previous
  // guest's same-day checkout is already handled by the exclusive overlap check.
  if (checkOutDate) return { taken, noon: [] }

  const supabase = createClient()
  const takenSet = new Set(taken)
  const noon: string[] = []

  // Night bookings checking out on the visit date — previous guest leaves at noon.
  let bookingQuery = supabase
    .from('booking_rooms')
    .select('room_numbers, bookings!inner(id, check_out_date, status)')
    .eq('bookings.check_out_date', visitDate)
    .neq('bookings.status', 'cancelled')

  if (excludeBookingId) {
    bookingQuery = bookingQuery.neq('bookings.id', excludeBookingId)
  }

  const { data: bookingRows } = await bookingQuery
  for (const row of bookingRows ?? []) {
    const b = (row as any).bookings
    if (!b || b.status === 'cancelled' || b.status === 'no_show') continue
    for (const n of (row as any).room_numbers ?? []) {
      if (!takenSet.has(n)) noon.push(n)
    }
  }

  // Confirmed, not-yet-converted quotes checking out on the visit date.
  const { data: quoteRows } = await supabase
    .from('quote_rooms')
    .select('room_numbers, quotes!inner(check_out_date, status, converted_to_booking_id)')
    .eq('quotes.check_out_date', visitDate)
    .eq('quotes.status', 'confirmed')
    .is('quotes.converted_to_booking_id', null)

  for (const row of quoteRows ?? []) {
    for (const n of (row as any).room_numbers ?? []) {
      if (!takenSet.has(n)) noon.push(n)
    }
  }

  return { taken, noon: [...new Set(noon)] }
}
