import { createClient } from '@/lib/supabase/server'
import { checkRoomAvailability } from '@/lib/engine/availability'
import { nextDay } from '@/lib/config/rooms'
import { addDaysIso } from '@/lib/dates'
import {
  distinctDates, roomsRequestedOnDate, roomNumbersOnDate, type GroupSegment,
} from '@/lib/bookings/group-itinerary'
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

  // Group itineraries keep their rooms in booking_days / quote_days, one row
  // per date, so they are fetched by exact date rather than by range overlap.
  // Status is re-checked in JS below, as it is for the range rows.
  let dayRoomQuery = db
    .from('booking_day_rooms')
    .select('room_type, qty, booking_days!inner(day_date, booking_id, bookings!inner(status))')
    .gte('booking_days.day_date', rangeStart)
    .lt('booking_days.day_date', rangeEnd)
  if (excludeBookingId) dayRoomQuery = dayRoomQuery.neq('booking_days.booking_id', excludeBookingId)

  let quoteDayRoomQuery = db
    .from('quote_day_rooms')
    .select('room_type, qty, quote_days!inner(day_date, quote_id, quotes!inner(status, converted_to_booking_id))')
    .gte('quote_days.day_date', rangeStart)
    .lt('quote_days.day_date', rangeEnd)
  if (excludeQuoteId) quoteDayRoomQuery = quoteDayRoomQuery.neq('quote_days.quote_id', excludeQuoteId)

  const [
    { data: inventory }, { data: bookingOccupied }, { data: quoteOccupied },
    { data: dayRoomOccupied }, { data: quoteDayRoomOccupied },
  ] = await Promise.all([
    db.from('room_inventory').select('room_type, total_units'),
    bookingQuery,
    quoteQuery,
    dayRoomQuery,
    quoteDayRoomQuery,
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
    for (const row of (dayRoomOccupied ?? []) as any[]) {
      const d = row.booking_days
      const b = d?.bookings
      if (!d || !b || b.status === 'cancelled' || b.status === 'no_show') continue
      if (d.day_date !== date) continue
      occupied.set(row.room_type, (occupied.get(row.room_type) ?? 0) + row.qty)
    }
    for (const row of (quoteDayRoomOccupied ?? []) as any[]) {
      const d = row.quote_days
      const q = d?.quotes
      if (!d || !q || q.status !== 'confirmed' || q.converted_to_booking_id) continue
      if (d.day_date !== date) continue
      occupied.set(row.room_type, (occupied.get(row.room_type) ?? 0) + row.qty)
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

  const [{ data: bookingOccupied }, { data: quoteOccupied }, { data: dayRooms }, { data: quoteDayRooms }] = await Promise.all([
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
    // Group itineraries — rooms on exactly this date.
    (supabase as any)
      .from('booking_day_rooms')
      .select('room_type, qty, booking_days!inner(day_date, bookings!inner(status))')
      .eq('booking_days.day_date', date),
    (supabase as any)
      .from('quote_day_rooms')
      .select('room_type, qty, quote_days!inner(day_date, quotes!inner(status, converted_to_booking_id))')
      .eq('quote_days.day_date', date),
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
  for (const row of (dayRooms ?? []) as any[]) {
    const b = row.booking_days?.bookings
    if (!b || b.status === 'cancelled' || b.status === 'no_show') continue
    occupied.push({ room_type: row.room_type as RoomType, qty_booked: row.qty })
  }
  for (const row of (quoteDayRooms ?? []) as any[]) {
    const q = row.quote_days?.quotes
    if (!q || q.status !== 'confirmed' || q.converted_to_booking_id) continue
    occupied.push({ room_type: row.room_type as RoomType, qty_booked: row.qty })
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any
  const [{ data, error }, { data: segs }] = await Promise.all([
    sb.from('bookings')
      .select('package_type, visit_date, check_out_date, status, adults, children_paid, children_free, drivers')
      .not('status', 'in', '(cancelled,no_show)')
      .lte('visit_date', date)
      .or(`check_out_date.gt.${date},and(check_out_date.is.null,visit_date.eq.${date})`),
    sb.from('booking_days')
      .select('stay_kind, adults, children_paid, children_free, drivers, bookings!inner(id, visit_date, status)')
      .eq('day_date', date),
  ])
  if (error) throw new Error(`getGuestsOnDate: ${error.message}`)

  const out: DayGuestCounts = {
    bookings: 0, adults: 0, children: 0, drivers: 0, guests: 0,
    daylong_bookings: 0, daylong_guests: 0, night_bookings: 0, night_guests: 0,
    arriving: 0,
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const b of ((data ?? []) as any[])) {
    // A group's header holds its PEAK day, which is the wrong number for
    // any specific date — its segments are read instead, below.
    if (b.package_type === 'group') continue
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

  // Group itineraries: each segment on this date puts its own people on site.
  // One booking may have both an overnight and a day-guest segment; it counts
  // as one booking, and as one arrival if today is its first day.
  const groupIds = new Set<string>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const s of ((segs ?? []) as any[])) {
    const b = s.bookings
    if (!b || b.status === 'cancelled' || b.status === 'no_show') continue
    const adults   = Number(s.adults ?? 0)
    const children = Number(s.children_paid ?? 0) + Number(s.children_free ?? 0)
    out.adults   += adults
    out.children += children
    out.drivers  += Number(s.drivers ?? 0)
    out.guests   += adults + children
    if (s.stay_kind === 'daylong') out.daylong_guests += adults + children
    else                           out.night_guests   += adults + children
    if (!groupIds.has(b.id)) {
      groupIds.add(b.id)
      out.bookings += 1
      if (s.stay_kind === 'daylong') out.daylong_bookings += 1
      else                           out.night_bookings   += 1
      if (b.visit_date === date) out.arriving += 1
    }
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

  let dayQuery = (supabase as any)
    .from('booking_day_rooms')
    .select('room_numbers, booking_days!inner(day_date, booking_id, bookings!inner(status))')
    .gte('booking_days.day_date', aStart)
    .lt('booking_days.day_date', aEnd)
  if (excludeBookingId) dayQuery = dayQuery.neq('booking_days.booking_id', excludeBookingId)

  const [{ data }, { data: dayData }] = await Promise.all([query, dayQuery])

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
  // Itinerary rooms are already date-bounded by the query.
  for (const row of (dayData ?? []) as any[]) {
    const b = row.booking_days?.bookings
    if (!b || b.status === 'cancelled' || b.status === 'no_show') continue
    taken.push(...(row.room_numbers ?? []))
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

  // A group's overnight segment on the previous date checks out of those
  // rooms this morning — unless the same room is slept in again tonight, in
  // which case it is already in `taken` and stays red.
  const prevDate = addDaysIso(visitDate, -1)
  let groupNight = (supabase as any)
    .from('booking_day_rooms')
    .select('room_numbers, booking_days!inner(day_date, stay_kind, booking_id, bookings!inner(status))')
    .eq('booking_days.day_date', prevDate)
    .eq('booking_days.stay_kind', 'night')
  if (excludeBookingId) groupNight = groupNight.neq('booking_days.booking_id', excludeBookingId)
  const { data: groupRows } = await groupNight
  for (const row of (groupRows ?? []) as any[]) {
    const b = row.booking_days?.bookings
    if (!b || b.status === 'cancelled' || b.status === 'no_show') continue
    for (const n of row.room_numbers ?? []) if (!takenSet.has(n)) noon.push(n)
  }

  return { taken, noon: [...new Set(noon)] }
}

// ─── Group itineraries ───────────────────────────────────────────────────────

/**
 * Capacity check for a whole itinerary: every date is checked on its own,
 * with that date's rooms summed across its overnight and day-guest segments.
 * Returns the first conflict message, or null.
 */
export async function checkGroupAvailabilityConflict(
  segments: GroupSegment[],
  opts: { excludeBookingId?: string; excludeQuoteId?: string } = {},
): Promise<string | null> {
  for (const date of distinctDates(segments)) {
    const requested = roomsRequestedOnDate(segments, date)
    if (requested.length === 0) continue
    const conflict = await checkAvailabilityConflict(
      date, null, requested, opts.excludeBookingId, opts.excludeQuoteId,
    )
    if (conflict) return conflict
  }
  return null
}

/**
 * Physical room numbers the itinerary names that another booking already
 * holds on the same date. Empty when all clear.
 */
export async function findGroupRoomNumberConflicts(
  segments: GroupSegment[],
  excludeBookingId?: string,
): Promise<Array<{ date: string; room: string }>> {
  const out: Array<{ date: string; room: string }> = []
  for (const date of distinctDates(segments)) {
    const wanted = roomNumbersOnDate(segments, date)
    if (wanted.length === 0) continue
    const taken = new Set(await getBookedRoomNumbers(date, null, excludeBookingId))
    for (const room of wanted) if (taken.has(room)) out.push({ date, room })
  }
  return out
}
