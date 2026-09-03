import { createClient } from '@/lib/supabase/server'
import { addDaysIso } from '@/lib/dates'
import {
  occupancyOnDate, findHalvesConflict, availabilityByHalves, roomNumberBuckets,
  type StayLike, type OccupancyRecord, type RequestedRoom,
} from '@/lib/engine/halves'
import { distinctDates, type GroupSegment } from '@/lib/bookings/group-itinerary'
import type { AvailabilityResult, RoomInventoryRow, RoomType } from '@/lib/supabase/types'

export type { RequestedRoom } from '@/lib/engine/halves'

/**
 * AVAILABILITY — the database side of lib/engine/halves.ts.
 *
 * Every question ("can this quote have these rooms?", "what is free on the
 * 10th?", "which room numbers can the picker offer?") is answered the same
 * way: fetch every stay that touches the dates, turn each into what it
 * occupies per date split into DAY and NIGHT halves, and ask the pure engine.
 * A room handed over at 6 PM occupies the night only, so its day can still be
 * sold; a daylong occupies the day only, so its night still can. One model,
 * one fetch shape, no special cases downstream.
 *
 * Sources: booking_rooms, confirmed-but-unconverted quote_rooms, and group
 * itinerary segments (each one night or one day). Cancelled and no-show
 * bookings occupy nothing — the room is back on the market.
 */

// ─── Fetching stays ──────────────────────────────────────────────────────────

interface FetchOpts { excludeBookingId?: string; excludeQuoteId?: string }

/**
 * Every stay overlapping [rangeStart, rangeEnd), as StayLike records.
 *
 * Bounded fetches: without the overlap predicate this used to match every
 * historical row, and past PostgREST's 1000-row cap current bookings silently
 * fell out of the occupancy sum — the capacity guard approved overbookings.
 */
async function fetchStays(rangeStart: string, rangeEnd: string, opts: FetchOpts = {}): Promise<StayLike[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createClient() as any
  const overlapOr = `check_out_date.gt.${rangeStart},and(check_out_date.is.null,visit_date.gte.${rangeStart})`

  let bookingQ = db
    .from('booking_rooms')
    .select('room_type, qty, room_numbers, evening_rooms, bookings!inner(id, package_type, visit_date, check_out_date, status)')
    .lt('bookings.visit_date', rangeEnd)
    .or(overlapOr, { foreignTable: 'bookings' })
    .neq('bookings.status', 'cancelled')
  if (opts.excludeBookingId) bookingQ = bookingQ.neq('bookings.id', opts.excludeBookingId)

  let quoteQ = db
    .from('quote_rooms')
    .select('room_type, qty, room_numbers, evening_rooms, quotes!inner(id, package_type, visit_date, check_out_date, status, converted_to_booking_id)')
    .lt('quotes.visit_date', rangeEnd)
    .or(overlapOr, { foreignTable: 'quotes' })
    .eq('quotes.status', 'confirmed')
    .is('quotes.converted_to_booking_id', null)
  if (opts.excludeQuoteId) quoteQ = quoteQ.neq('quotes.id', opts.excludeQuoteId)

  // Group itineraries keep their rooms one row per date.
  let dayQ = db
    .from('booking_day_rooms')
    .select('room_type, qty, room_numbers, evening_rooms, booking_days!inner(day_date, stay_kind, booking_id, bookings!inner(status))')
    .gte('booking_days.day_date', addDaysIso(rangeStart, -1))   // a night segment the day before still covers the night
    .lt('booking_days.day_date', rangeEnd)
  if (opts.excludeBookingId) dayQ = dayQ.neq('booking_days.booking_id', opts.excludeBookingId)

  let quoteDayQ = db
    .from('quote_day_rooms')
    .select('room_type, qty, room_numbers, evening_rooms, quote_days!inner(day_date, stay_kind, quote_id, quotes!inner(status, converted_to_booking_id))')
    .gte('quote_days.day_date', addDaysIso(rangeStart, -1))
    .lt('quote_days.day_date', rangeEnd)
  if (opts.excludeQuoteId) quoteDayQ = quoteDayQ.neq('quote_days.quote_id', opts.excludeQuoteId)

  const [{ data: br }, { data: qr }, { data: bdr }, { data: qdr }] =
    await Promise.all([bookingQ, quoteQ, dayQ, quoteDayQ])

  const stays: StayLike[] = []
  const room = (r: any) => ({   // eslint-disable-line @typescript-eslint/no-explicit-any
    room_type: r.room_type as string, qty: Number(r.qty ?? 0),
    room_numbers: (r.room_numbers ?? []) as string[], evening_rooms: (r.evening_rooms ?? []) as string[],
  })
  const kindOf = (t: string): 'daylong' | 'night' | null =>
    t === 'daylong' ? 'daylong' : t === 'night' ? 'night' : null

  // Status is re-checked here: the embedded filter doesn't reliably cascade to
  // parent rows under !inner in every PostgREST version.
  for (const r of (br ?? []) as any[]) {   // eslint-disable-line @typescript-eslint/no-explicit-any
    const b = r.bookings
    if (!b || b.status === 'cancelled' || b.status === 'no_show') continue
    const kind = kindOf(b.package_type); if (!kind) continue
    stays.push({ package_type: kind, visit_date: b.visit_date, check_out_date: b.check_out_date, rooms: [room(r)] })
  }
  for (const r of (qr ?? []) as any[]) {   // eslint-disable-line @typescript-eslint/no-explicit-any
    const q = r.quotes
    if (!q || q.status !== 'confirmed' || q.converted_to_booking_id) continue
    const kind = kindOf(q.package_type); if (!kind) continue
    stays.push({ package_type: kind, visit_date: q.visit_date, check_out_date: q.check_out_date, rooms: [room(r)] })
  }
  const segment = (d: any, r: any): StayLike | null => {   // eslint-disable-line @typescript-eslint/no-explicit-any
    if (!d) return null
    return d.stay_kind === 'night'
      ? { package_type: 'night',   visit_date: d.day_date, check_out_date: addDaysIso(d.day_date, 1), rooms: [room(r)] }
      : { package_type: 'daylong', visit_date: d.day_date, check_out_date: null, rooms: [room(r)] }
  }
  for (const r of (bdr ?? []) as any[]) {   // eslint-disable-line @typescript-eslint/no-explicit-any
    const b = r.booking_days?.bookings
    if (!b || b.status === 'cancelled' || b.status === 'no_show') continue
    const s = segment(r.booking_days, r); if (s) stays.push(s)
  }
  for (const r of (qdr ?? []) as any[]) {   // eslint-disable-line @typescript-eslint/no-explicit-any
    const q = r.quote_days?.quotes
    if (!q || q.status !== 'confirmed' || q.converted_to_booking_id) continue
    const s = segment(r.quote_days, r); if (s) stays.push(s)
  }
  return stays
}

function occupancyFor(stays: StayLike[], date: string): OccupancyRecord[] {
  return stays.flatMap((s) => occupancyOnDate(s, date))
}

async function inventoryTotals(): Promise<Map<string, number>> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createClient() as any
  const { data } = await db.from('room_inventory').select('room_type, total_units')
  return new Map(((data ?? []) as Array<{ room_type: string; total_units: number }>)
    .map((r) => [r.room_type, Number(r.total_units ?? 0)]))
}

function datesOf(visitDate: string, checkOutDate: string | null): string[] {
  if (!checkOutDate) return [visitDate]
  const out: string[] = []
  for (let d = visitDate; d < checkOutDate; d = addDaysIso(d, 1)) out.push(d)
  return out
}

// ─── Capacity check ──────────────────────────────────────────────────────────

/**
 * Can these rooms be had on every date of [visitDate, checkOutDate) — or on
 * visitDate alone for a daylong (checkOutDate null)? Room numbers and
 * evening_rooms on the request make the check exact; without them it is a
 * per-type count. Returns a human-readable conflict, or null.
 */
export async function checkAvailabilityConflict(
  visitDate: string,
  checkOutDate: string | null,
  requestedRooms: RequestedRoom[],
  excludeBookingId?: string,
  excludeQuoteId?: string,
): Promise<string | null> {
  if (requestedRooms.every((r) => r.qty <= 0)) return null
  const dates = datesOf(visitDate, checkOutDate)
  const [inventory, stays] = await Promise.all([
    inventoryTotals(),
    fetchStays(visitDate, checkOutDate ?? addDaysIso(visitDate, 1), { excludeBookingId, excludeQuoteId }),
  ])
  const kind = checkOutDate ? 'night' : 'daylong'
  for (const date of dates) {
    const conflict = findHalvesConflict(inventory, occupancyFor(stays, date), requestedRooms, kind, date === visitDate, date)
    if (conflict) return conflict
  }
  return null
}

// ─── Per-date availability (grid, API) ───────────────────────────────────────

function toResults(
  inventory: RoomInventoryRow[],
  occupancy: OccupancyRecord[],
  packageType?: 'daylong' | 'night',
): AvailabilityResult[] {
  const halves = new Map(availabilityByHalves(inventory, occupancy).map((h) => [h.room_type, h]))
  return [...inventory]
    .sort((a, b) => a.display_order - b.display_order)
    // Daylong-only rooms aren't for night stays.
    .filter((r) => !(packageType === 'night' && r.daylong_only))
    .map((r) => {
      const h = halves.get(r.room_type)!
      // "All" reads the night half — the stricter of the two, and what a
      // reservation desk means by "is the room free"; both halves are carried.
      const useDay = packageType === 'daylong'
      return {
        room_type:       r.room_type,
        display_name:    r.display_name,
        total_units:     r.total_units,
        booked:          useDay ? h.booked_day : h.booked_night,
        available:       useDay ? h.available_day : h.available_night,
        booked_day:      h.booked_day,
        available_day:   h.available_day,
        booked_night:    h.booked_night,
        available_night: h.available_night,
        daylong_only:    r.daylong_only,
      }
    })
}

/** Room availability for a single date, both halves. */
export async function getRoomAvailability(
  date: string,
  inventory: RoomInventoryRow[],
  packageType?: 'daylong' | 'night',
): Promise<AvailabilityResult[]> {
  const stays = await fetchStays(date, addDaysIso(date, 1))
  return toResults(inventory, occupancyFor(stays, date), packageType)
}

/** Availability over a range, from the SQL function the calendar uses. */
export async function getAvailabilityRange(
  from: string,
  to: string,
  inventory: RoomInventoryRow[],
  packageType?: 'daylong' | 'night',
): Promise<Map<string, AvailabilityResult[]>> {
  const supabase = createClient()
  const { data, error } = await supabase.rpc('get_availability_range', { p_from: from, p_to: to })
  if (error) {
    console.error('get_availability_range RPC error:', error)
    return new Map()
  }
  return rangeRowsToResults((data ?? []) as any[], inventory, packageType)   // eslint-disable-line @typescript-eslint/no-explicit-any
}

/** Shared by the query above and the availability API's range path. */
export function rangeRowsToResults(
  rows: Array<{ check_date: string; check_room_type: string; qty_day?: number | string; qty_night?: number | string; qty_booked?: number | string }>,
  inventory: RoomInventoryRow[],
  packageType?: 'daylong' | 'night',
): Map<string, AvailabilityResult[]> {
  const byDate = new Map<string, OccupancyRecord[]>()
  for (const row of rows) {
    const date = String(row.check_date)
    const list = byDate.get(date) ?? []
    // Older function shape (qty_booked only) is read as "both halves".
    const day   = Number(row.qty_day   ?? row.qty_booked ?? 0)
    const night = Number(row.qty_night ?? row.qty_booked ?? 0)
    const both  = Math.min(day, night)
    if (both > 0)        list.push({ room_type: row.check_room_type, qty: both,         room_numbers: [], day: true,  night: true })
    if (day - both > 0)  list.push({ room_type: row.check_room_type, qty: day - both,   room_numbers: [], day: true,  night: false })
    if (night - both > 0) list.push({ room_type: row.check_room_type, qty: night - both, room_numbers: [], day: false, night: true })
    byDate.set(date, list)
  }
  const out = new Map<string, AvailabilityResult[]>()
  for (const [date, occ] of byDate) out.set(date, toResults(inventory, occ, packageType))
  return out
}

// ─── Room numbers for the pickers ────────────────────────────────────────────

export interface RoomNumberBuckets {
  /** Cannot be picked at all for this request. */
  taken:        string[]
  /** Daylong only: the previous night's guest checks out this morning —
   *  usable after ~noon. Selectable, with a caveat. */
  noon:         string[]
  /** Night only: held by day guests on the check-in day — usable as a room
   *  handed over in the evening. Selectable as an evening room. */
  eveningOnly:  string[]
  /** Daylong only: a night guest arrives this evening — fine for a day
   *  visit; say so. */
  untilEvening: string[]
}

/**
 * Which physical rooms a request on these dates can have, and on what terms.
 * Night requests: a room must be free every night, and free by day on every
 * date after the first; on the first date a day-held room is `eveningOnly`.
 */
export async function getRoomNumberBuckets(
  visitDate:        string,
  checkOutDate:     string | null,
  excludeBookingId?: string,
  /** The quote being edited or converted. Confirmed quotes hold their room
   *  numbers, so without this a quote reads its own rooms as taken and
   *  refuses to convert — "booked by someone else", by itself. */
  excludeQuoteId?:   string,
): Promise<RoomNumberBuckets> {
  const kind  = checkOutDate ? 'night' : 'daylong'
  const dates = datesOf(visitDate, checkOutDate)
  // One day earlier so stays checking out on visitDate are seen (noon rule).
  const stays = await fetchStays(addDaysIso(visitDate, -1), checkOutDate ?? addDaysIso(visitDate, 1), { excludeBookingId, excludeQuoteId })

  if (kind === 'daylong') {
    const b = roomNumberBuckets(occupancyFor(stays, visitDate), 'daylong')
    const takenSet = new Set(b.taken)
    const noon = new Set<string>()
    for (const s of stays) {
      if (s.package_type !== 'night' || s.check_out_date !== visitDate) continue
      for (const r of s.rooms) for (const n of r.room_numbers) if (!takenSet.has(n)) noon.add(n)
    }
    return { taken: b.taken, noon: [...noon], eveningOnly: [], untilEvening: b.untilEvening }
  }

  const taken = new Set<string>()
  let eveningOnly: string[] = []
  dates.forEach((date, i) => {
    const b = roomNumberBuckets(occupancyFor(stays, date), 'night')
    for (const n of b.taken) taken.add(n)
    if (i === 0) eveningOnly = b.eveningOnly
    else for (const n of b.eveningOnly) taken.add(n)   // day-held on a later date = guest in house = taken
  })
  return {
    taken:        [...taken],
    noon:         [],
    eveningOnly:  eveningOnly.filter((n) => !taken.has(n)),
    untilEvening: [],
  }
}

/** Flat "cannot pick" list — kept for callers that only need that. */
export async function getBookedRoomNumbers(
  visitDate: string, checkOutDate: string | null, excludeBookingId?: string,
): Promise<string[]> {
  return (await getRoomNumberBuckets(visitDate, checkOutDate, excludeBookingId)).taken
}

/** Same buckets, under the name the room-number API has always used. */
export const getRoomNumberAvailability = getRoomNumberBuckets

/**
 * Physical room numbers a request names that it cannot have. Instant rooms
 * need the room free in both halves; evening rooms need only the night.
 */
export async function findRoomNumberConflicts(
  rooms: RequestedRoom[],
  visitDate: string,
  checkOutDate: string | null,
  excludeBookingId?: string,
  excludeQuoteId?: string,
): Promise<string[]> {
  const b = await getRoomNumberBuckets(visitDate, checkOutDate, excludeBookingId, excludeQuoteId)
  const taken = new Set(b.taken), eveningOnly = new Set(b.eveningOnly)
  const out: string[] = []
  for (const r of rooms) {
    const evening = new Set(r.evening_rooms ?? [])
    for (const n of r.room_numbers ?? []) {
      if (taken.has(n)) { out.push(n); continue }
      if (checkOutDate && eveningOnly.has(n) && !evening.has(n)) out.push(n)
    }
  }
  return [...new Set(out)]
}

// ─── Guests on a date ────────────────────────────────────────────────────────

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createClient() as any
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

// ─── Group itineraries ───────────────────────────────────────────────────────

/** A segment as the engine sees it: one night (with evening rooms) or one day. */
function segmentRequest(seg: GroupSegment): { kind: 'daylong' | 'night'; rooms: RequestedRoom[] } {
  return {
    kind:  seg.stay_kind === 'night' ? 'night' : 'daylong',
    rooms: seg.rooms.map((r) => ({
      room_type: r.room_type, qty: r.qty,
      room_numbers: r.room_numbers ?? [], evening_rooms: r.evening_rooms ?? [],
    })),
  }
}

/**
 * Capacity check for a whole itinerary against everything ELSE on the books,
 * segment by segment. The validator already keeps the itinerary consistent
 * with itself (a room slept in on the 5th can only be lent to that day's
 * day guests as an evening room).
 */
export async function checkGroupAvailabilityConflict(
  segments: GroupSegment[],
  opts: { excludeBookingId?: string; excludeQuoteId?: string } = {},
): Promise<string | null> {
  for (const seg of segments) {
    if (seg.rooms.length === 0) continue
    const { kind, rooms } = segmentRequest(seg)
    const conflict = await checkAvailabilityConflict(
      seg.day_date, kind === 'night' ? addDaysIso(seg.day_date, 1) : null, rooms,
      opts.excludeBookingId, opts.excludeQuoteId,
    )
    if (conflict) return conflict
  }
  return null
}

/** Room numbers the itinerary names that another booking already holds. */
export async function findGroupRoomNumberConflicts(
  segments: GroupSegment[],
  excludeBookingId?: string,
  excludeQuoteId?: string,
): Promise<Array<{ date: string; room: string }>> {
  const out: Array<{ date: string; room: string }> = []
  for (const date of distinctDates(segments)) {
    for (const seg of segments) {
      if (seg.day_date !== date || seg.rooms.length === 0) continue
      const { kind, rooms } = segmentRequest(seg)
      const clashes = await findRoomNumberConflicts(
        rooms, date, kind === 'night' ? addDaysIso(date, 1) : null, excludeBookingId, excludeQuoteId,
      )
      for (const room of clashes) out.push({ date, room })
    }
  }
  return out
}

export type { RoomType }
