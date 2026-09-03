/**
 * ROOM HALVES — a room-date has a DAY and a NIGHT, and they can be sold to
 * different people.
 *
 * The resort often hands a night booking two of its four rooms on arrival
 * and the other two at 6 PM, after that day's day guests leave. Until now a
 * night booking blocked its rooms for the whole of its check-in day, so the
 * day on those two rooms went unsold. Splitting each date into halves fixes
 * that at the root:
 *
 *   what is on the room that date            day     night
 *   ─────────────────────────────────────────────────────────
 *   night stay, instant room, check-in day   taken   taken
 *   night stay, 6 PM room,   check-in day    free    taken
 *   night stay, any room,    middle of stay  taken   taken
 *   night stay, any room,    checkout day    free    free   (noon rule)
 *   daylong                                  taken   free
 *
 * A daylong request needs the day. A night request needs the night for all
 * its rooms and the day for its instant rooms only. Everything else in the
 * availability system is this table applied per room type (counts) and per
 * physical room number (exact).
 *
 * Pure functions, no I/O. The database layer builds StayLike records; the
 * tests pin the resort's own scenario.
 */

export interface StayRoom {
  room_type:      string
  qty:            number
  room_numbers:   string[]
  /** Subset of room_numbers handed over at the evening handover time on the
   *  check-in day. Ignored for daylong stays and for later nights. */
  evening_rooms?: string[]
}

export interface StayLike {
  package_type:   'daylong' | 'night'
  visit_date:     string
  check_out_date: string | null
  rooms:          StayRoom[]
}

export interface OccupancyRecord {
  room_type:    string
  qty:          number
  room_numbers: string[]
  day:          boolean
  night:        boolean
}

/** What a stay occupies on one date, split into halves. */
export function occupancyOnDate(stay: StayLike, date: string): OccupancyRecord[] {
  const out: OccupancyRecord[] = []
  if (stay.package_type === 'daylong') {
    if (stay.visit_date !== date) return out
    for (const r of stay.rooms) {
      if (r.qty > 0) out.push({ room_type: r.room_type, qty: r.qty, room_numbers: r.room_numbers ?? [], day: true, night: false })
    }
    return out
  }
  const checkOut = stay.check_out_date
  if (!checkOut || date < stay.visit_date || date >= checkOut) return out
  const isCheckIn = date === stay.visit_date
  for (const r of stay.rooms) {
    if (r.qty <= 0) continue
    const nums    = r.room_numbers ?? []
    const evening = isCheckIn ? (r.evening_rooms ?? []).filter((n) => nums.includes(n)) : []
    if (evening.length > 0) {
      out.push({ room_type: r.room_type, qty: evening.length, room_numbers: evening, day: false, night: true })
    }
    const instantQty = Math.max(0, r.qty - evening.length)
    if (instantQty > 0) {
      out.push({
        room_type: r.room_type, qty: instantQty,
        room_numbers: nums.filter((n) => !evening.includes(n)),
        day: true, night: true,
      })
    }
  }
  return out
}

export interface RequestedRoom {
  room_type:      string
  qty:            number
  room_numbers?:  string[]
  evening_rooms?: string[]
}

export interface HalfTotals {
  day:   number   // rooms taken by day
  night: number   // rooms taken by night
  /** Rooms taken in EITHER half — what an instant room must find free. Exact
   *  when every record carries numbers; count-only records are assumed not
   *  to overlap, which under-states free rooms rather than over-stating. */
  either: number
  dayNums:   Set<string>
  nightNums: Set<string>
}

export function totalsByType(records: OccupancyRecord[]): Map<string, HalfTotals> {
  const map = new Map<string, HalfTotals>()
  for (const rec of records) {
    const t = map.get(rec.room_type) ?? { day: 0, night: 0, either: 0, dayNums: new Set(), nightNums: new Set() }
    if (rec.day)   t.day   += rec.qty
    if (rec.night) t.night += rec.qty
    const numbered = rec.room_numbers.length
    for (const n of rec.room_numbers) {
      if (rec.day)   t.dayNums.add(n)
      if (rec.night) t.nightNums.add(n)
    }
    // Numbered rooms are unioned below; count-only rooms are added as-is.
    t.either += Math.max(0, rec.qty - numbered)
    map.set(rec.room_type, t)
  }
  for (const t of map.values()) {
    t.either += new Set([...t.dayNums, ...t.nightNums]).size
  }
  return map
}

const label = (t: string) => t.replace(/_/g, ' ')

/**
 * The first reason a request cannot have these rooms on this date, or null.
 *
 * `kind` is what is being asked for; `isCheckIn` matters only for night
 * requests (6 PM rooms are night-only on the check-in day, both halves on
 * every later night).
 */
export function findHalvesConflict(
  inventory: ReadonlyMap<string, number>,
  occupancy: OccupancyRecord[],
  requested: RequestedRoom[],
  kind: 'daylong' | 'night',
  isCheckIn: boolean,
  date: string,
): string | null {
  const totals = totalsByType(occupancy)

  for (const req of requested) {
    if (req.qty <= 0) continue
    const total = inventory.get(req.room_type) ?? 0
    const t = totals.get(req.room_type) ?? { day: 0, night: 0, either: 0, dayNums: new Set<string>(), nightNums: new Set<string>() }
    const nums    = req.room_numbers ?? []
    const evening = kind === 'night' && isCheckIn ? (req.evening_rooms ?? []).filter((n) => nums.includes(n)) : []
    const instant = nums.filter((n) => !evening.includes(n))

    // Named rooms first: "Room 202 is taken" is what the agent can act on;
    // the per-type count is the fallback for rooms without numbers.
    if (kind === 'daylong') {
      for (const n of nums) {
        if (t.dayNums.has(n)) return `Room ${n} is already taken by day on ${date}`
      }
      const free = total - t.day
      if (req.qty > free) {
        return `${label(req.room_type)} is unavailable on ${date} (${Math.max(0, free)} of ${total} free by day, ${req.qty} requested)`
      }
      continue
    }

    // Night request: every room needs the night; instant rooms need the day too.
    for (const n of evening) {
      if (t.nightNums.has(n)) return `Room ${n} is already booked for the night of ${date}`
    }
    for (const n of instant) {
      if (t.nightNums.has(n)) return `Room ${n} is already booked for the night of ${date}`
      if (t.dayNums.has(n))   return `Room ${n} is taken by day guests on ${date} — it can only be handed over in the evening`
    }
    const freeNight = total - t.night
    if (req.qty > freeNight) {
      return `${label(req.room_type)} is unavailable on ${date} (${Math.max(0, freeNight)} of ${total} free for the night, ${req.qty} requested)`
    }
    const instantQty = req.qty - evening.length
    const freeBoth   = total - t.either
    if (instantQty > freeBoth) {
      return evening.length > 0 || t.day > t.night
        ? `${label(req.room_type)} on ${date}: only ${Math.max(0, freeBoth)} room${freeBoth === 1 ? '' : 's'} free all day (${instantQty} requested on arrival) — hand more over at the evening handover, or pick other rooms`
        : `${label(req.room_type)} is unavailable on ${date} (${Math.max(0, freeBoth)} of ${total} free, ${req.qty} requested)`
    }
  }
  return null
}

/** Per-type availability for one date, both halves. */
export interface HalfAvailability {
  room_type:      string
  booked_day:     number
  booked_night:   number
  /** Rooms taken in EITHER half — what "fully booked" means at the desk. */
  booked_any:     number
  available_day:  number
  available_night: number
  /** Rooms free the whole day — the honest headline number. */
  available_both: number
}

export function availabilityByHalves(
  inventory: Array<{ room_type: string; total_units: number }>,
  occupancy: OccupancyRecord[],
): HalfAvailability[] {
  const totals = totalsByType(occupancy)
  return inventory.map((inv) => {
    const t = totals.get(inv.room_type)
    const bd = t?.day ?? 0
    const bn = t?.night ?? 0
    const ba = Math.min(inv.total_units, t?.either ?? 0)
    return {
      room_type:       inv.room_type,
      booked_day:      bd,
      booked_night:    bn,
      booked_any:      ba,
      available_day:   Math.max(0, inv.total_units - bd),
      available_night: Math.max(0, inv.total_units - bn),
      available_both:  Math.max(0, inv.total_units - ba),
    }
  })
}

/**
 * Physical room numbers, sorted into what the picker needs for a request on
 * `date`:
 *   taken        — cannot be picked at all
 *   eveningOnly  — (night requests) free for the night but held by day
 *                  guests until the evening: pick it as a 6 PM room
 *   untilEvening — (daylong requests) free by day, but a night guest arrives
 *                  in the evening: fine for a day visit, say so
 */
export function roomNumberBuckets(
  occupancy: OccupancyRecord[],
  kind: 'daylong' | 'night',
): { taken: string[]; eveningOnly: string[]; untilEvening: string[] } {
  const dayNums = new Set<string>(), nightNums = new Set<string>()
  for (const rec of occupancy) {
    for (const n of rec.room_numbers) {
      if (rec.day)   dayNums.add(n)
      if (rec.night) nightNums.add(n)
    }
  }
  if (kind === 'daylong') {
    return {
      taken:        [...dayNums],
      eveningOnly:  [],
      untilEvening: [...nightNums].filter((n) => !dayNums.has(n)),
    }
  }
  return {
    taken:        [...nightNums],
    eveningOnly:  [...dayNums].filter((n) => !nightNums.has(n)),
    untilEvening: [],
  }
}
