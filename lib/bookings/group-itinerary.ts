/**
 * Group bookings — the per-day itinerary behind a single booking and bill.
 *
 * A group (a conference, a wedding party, a company retreat) rarely has the
 * same shape two days running: 30 people in seven rooms on the first night,
 * two of them staying on in one room for three nights, 32 day guests on the
 * second day using three rooms for free. The ordinary booking — one package,
 * one date range, one room set, one headcount — cannot describe that, and
 * splitting it into three bookings gives the guest three bills.
 *
 * So a booking may instead carry SEGMENTS: one per (date, kind), where
 *   'night'   = these rooms are slept in that night, by these people
 *   'daylong' = these people use the resort that day and leave in the evening
 * and a date can have both. The booking's own visit_date / check_out_date /
 * headcount columns are DERIVED from the segments (deriveGroupHeader) so every
 * screen that reads those columns keeps working; the itinerary is the truth.
 *
 * Client-safe: no Supabase imports. Shared by the calculator, the validator,
 * the itinerary editor and every operations query that has to know who is on
 * site on a given day.
 */

import { addDaysIso, daysBetweenIso } from '@/lib/dates'

export type StayKind = 'night' | 'daylong'

export interface GroupSegmentRoom {
  room_type:     string
  display_name?: string
  qty:           number
  /** 0 = complimentary, as everywhere else in the system. */
  unit_price:    number
  room_numbers:  string[]
  /** Overnight segments only: rooms handed over in the evening, so the day
   *  on them can go to that date's day guests. */
  evening_rooms?: string[]
}

export interface GroupSegment {
  day_date:      string
  stay_kind:     StayKind
  adults:        number
  /** Present but not charged per head — counted in every headcount, skipped
   *  by the per-person rate. The 28 who paid last night's package and stay
   *  on for the day are the canonical case. */
  adults_comp:   number
  children_paid: number
  children_free: number
  drivers:       number
  extra_beds:    number
  rooms:         GroupSegmentRoom[]
  notes?:        string | null
}

export const STAY_KIND_LABEL: Record<StayKind, string> = {
  night:   'Overnight',
  daylong: 'Day guests',
}

export function isGroupPackage(packageType: string | null | undefined): boolean {
  return packageType === 'group'
}

/** Night before day on the same date — the order anyone would read them in. */
export function sortSegments<T extends { day_date: string; stay_kind: StayKind }>(segments: T[]): T[] {
  return [...segments].sort((a, b) =>
    a.day_date.localeCompare(b.day_date)
    || (a.stay_kind === b.stay_kind ? 0 : a.stay_kind === 'night' ? -1 : 1))
}

export interface DayPresence {
  date:          string
  adults:        number
  children_paid: number
  children_free: number
  drivers:       number
  /** adults + children, matching the rest of the system's "guests". */
  guests:        number
  rooms:         number
  overnight:     number   // guests sleeping here tonight
  day:           number   // guests leaving this evening
}

/** Who is on site on each date of the itinerary, both kinds combined. */
export function presenceByDate(segments: GroupSegment[]): DayPresence[] {
  const map = new Map<string, DayPresence>()
  for (const s of segments) {
    const cur = map.get(s.day_date) ?? {
      date: s.day_date, adults: 0, children_paid: 0, children_free: 0,
      drivers: 0, guests: 0, rooms: 0, overnight: 0, day: 0,
    }
    const guests = s.adults + s.children_paid + s.children_free
    cur.adults        += s.adults
    cur.children_paid += s.children_paid
    cur.children_free += s.children_free
    cur.drivers       += s.drivers
    cur.guests        += guests
    cur.rooms         += s.rooms.reduce((n, r) => n + r.qty, 0)
    if (s.stay_kind === 'night') cur.overnight += guests
    else                         cur.day       += guests
    map.set(s.day_date, cur)
  }
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date))
}

export interface GroupHeader {
  visit_date:     string
  /** The day the last guest leaves: the morning after the final night, or
   *  the final day itself when the itinerary ends with day guests. Null only
   *  for a single day of day guests, which is what a daylong booking is. */
  check_out_date: string | null
  adults:         number
  children_paid:  number
  children_free:  number
  drivers:        number
  extra_beds:     number
  /** Distinct nights with rooms slept in. */
  nights:         number
  /** Distinct calendar dates the group is on site. */
  days:           number
}

/**
 * The booking-level columns, derived from the itinerary.
 *
 * Headcounts are the PEAK day, not a sum — a sum would count the same person
 * once per day they stayed. Every legacy reader of bookings.adults (the
 * checkout screen's extra-guest maths, the booking table, exports) therefore
 * sees "the most people this booking ever had on site", which is the only
 * single number that is honest for a group.
 */
export function deriveGroupHeader(segments: GroupSegment[]): GroupHeader | null {
  if (segments.length === 0) return null
  const sorted = sortSegments(segments)
  const visit_date = sorted[0].day_date
  const lastDate   = sorted[sorted.length - 1].day_date
  const nightDates = [...new Set(sorted.filter((s) => s.stay_kind === 'night').map((s) => s.day_date))]
  const lastNight  = nightDates.length ? nightDates[nightDates.length - 1] : null

  let check_out_date: string | null
  if (lastNight) {
    const morningAfter = addDaysIso(lastNight, 1)
    check_out_date = morningAfter >= lastDate ? morningAfter : lastDate
  } else {
    check_out_date = lastDate > visit_date ? lastDate : null
  }

  const presence = presenceByDate(sorted)
  const peak = presence.reduce((best, d) => (d.guests > best.guests ? d : best), presence[0])
  const extraBedsPeak = Math.max(0, ...[...new Set(sorted.map((s) => s.day_date))].map((date) =>
    sorted.filter((s) => s.day_date === date).reduce((n, s) => n + s.extra_beds, 0)))

  return {
    visit_date,
    check_out_date,
    adults:        peak.adults,
    children_paid: peak.children_paid,
    children_free: peak.children_free,
    drivers:       peak.drivers,
    extra_beds:    extraBedsPeak,
    nights:        nightDates.length,
    days:          presence.length,
  }
}

/**
 * Room numbers used twice on one date in a way that can't work: the same room
 * in two overnight segments (impossible — one per date), or slept in AND lent
 * to day guests without being an evening room. An overnight room handed over
 * in the evening may serve that day's day guests first; that is the point.
 */
export function roomNumberClashesOnDate(segments: GroupSegment[], date: string): string[] {
  const night = segments.filter((s) => s.day_date === date && s.stay_kind === 'night')
  const day   = segments.filter((s) => s.day_date === date && s.stay_kind === 'daylong')
  const nightNums = new Set<string>(), evening = new Set<string>(), clashes = new Set<string>()
  for (const s of night) for (const r of s.rooms) {
    for (const n of r.room_numbers ?? []) { if (nightNums.has(n)) clashes.add(n); nightNums.add(n) }
    for (const n of r.evening_rooms ?? []) evening.add(n)
  }
  const dayNums = new Set<string>()
  for (const s of day) for (const r of s.rooms) for (const n of r.room_numbers ?? []) {
    if (dayNums.has(n)) clashes.add(n)
    dayNums.add(n)
    if (nightNums.has(n) && !evening.has(n)) clashes.add(n)
  }
  return [...clashes]
}

/** Every physical room number the itinerary uses on one date, across both kinds. */
export function roomNumbersOnDate(segments: GroupSegment[], date: string): string[] {
  const out: string[] = []
  for (const s of segments) {
    if (s.day_date !== date) continue
    for (const r of s.rooms) out.push(...(r.room_numbers ?? []))
  }
  return out
}

/** Rooms requested per type on one date, summed across both kinds. */
export function roomsRequestedOnDate(segments: GroupSegment[], date: string): Array<{ room_type: string; qty: number }> {
  const byType = new Map<string, number>()
  for (const s of segments) {
    if (s.day_date !== date) continue
    for (const r of s.rooms) byType.set(r.room_type, (byType.get(r.room_type) ?? 0) + r.qty)
  }
  return [...byType.entries()].map(([room_type, qty]) => ({ room_type, qty }))
}

export function distinctDates(segments: GroupSegment[]): string[] {
  return [...new Set(segments.map((s) => s.day_date))].sort()
}

// ─── Operations view ─────────────────────────────────────────────────────────

/** The meal-flag subset of a package snapshot the meals engine reads. */
export interface MealFlags {
  includes_breakfast?: boolean
  includes_lunch?:     boolean
  includes_dinner?:    boolean
  includes_snacks?:    boolean
}

/**
 * A group booking as the operations queries already understand it: a list of
 * ordinary-looking bookings, one per segment.
 *
 * The meals engine, the daily report, the kitchen's cover counts, the
 * dashboard's arrivals/departures — all of them reason about "a daylong on
 * this date" or "a night stay from D to D+1". Rather than teach each of them
 * about segments, a group is expanded into exactly those shapes:
 *
 *   night segment on D   → a one-night stay D → D+1
 *   daylong segment on D → a daylong on D
 *
 * That gives every consumer the right answer by construction: the 30 who
 * slept on the 4th get breakfast on the 5th from the 4th's virtual stay, the
 * 32 day guests get lunch and snacks from the 5th's virtual daylong, and the
 * two in Room 101 get lunch and dinner on the 5th from that night's virtual
 * stay — with nothing double-counted, because each person is in exactly one
 * segment per date.
 */
export interface OpsBooking extends MealFlags {
  package_type:   'night' | 'daylong'
  stay_kind:      StayKind
  day_date:       string
  visit_date:     string
  check_out_date: string | null
  adults:         number
  children_paid:  number
  children_free:  number
  drivers:        number
  rooms:          GroupSegmentRoom[]
  notes?:         string | null
}

export function expandGroupForOps(
  segments: GroupSegment[],
  nightFlags?: MealFlags | null,
  dayFlags?:   MealFlags | null,
): OpsBooking[] {
  return sortSegments(segments).map((s) => {
    const isNight = s.stay_kind === 'night'
    const flags = (isNight ? nightFlags : dayFlags) ?? {}
    return {
      package_type:   isNight ? 'night' : 'daylong',
      stay_kind:      s.stay_kind,
      day_date:       s.day_date,
      visit_date:     s.day_date,
      check_out_date: isNight ? addDaysIso(s.day_date, 1) : null,
      adults:         s.adults,
      children_paid:  s.children_paid,
      children_free:  s.children_free,
      drivers:        s.drivers,
      rooms:          s.rooms,
      notes:          s.notes ?? null,
      includes_breakfast: flags.includes_breakfast,
      includes_lunch:     flags.includes_lunch,
      includes_dinner:    flags.includes_dinner,
      includes_snacks:    flags.includes_snacks,
    }
  })
}

/**
 * Does a (possibly virtual) booking put people on site on `date`?
 * Night: the night itself. Daylong: the day itself. The checkout MORNING of a
 * night stay is deliberately not "on site" here — that crowd has left before
 * the day's guests arrive, which is the convention getGuestsOnDate uses.
 */
export function opsBookingCoversDate(b: OpsBooking, date: string): boolean {
  return b.day_date === date
}

// ─── Database rows → segments ────────────────────────────────────────────────

export interface GroupDayRowLike {
  day_date:      string
  stay_kind:     string
  adults:        number | null
  adults_comp?:  number | null
  children_paid: number | null
  children_free: number | null
  drivers:       number | null
  extra_beds?:   number | null
  notes?:        string | null
  rooms?:        Array<{ room_type: string; qty: number | null; unit_price: number | null; room_numbers: string[] | null; evening_rooms?: string[] | null }> | null
}

/** Normalise itinerary rows (with their embedded rooms) into segments. */
export function rowsToSegments(rows: GroupDayRowLike[] | null | undefined): GroupSegment[] {
  return sortSegments((rows ?? []).map((r) => ({
    day_date:      r.day_date,
    stay_kind:     (r.stay_kind === 'night' ? 'night' : 'daylong') as StayKind,
    adults:        Number(r.adults ?? 0),
    adults_comp:   Number(r.adults_comp ?? 0),
    children_paid: Number(r.children_paid ?? 0),
    children_free: Number(r.children_free ?? 0),
    drivers:       Number(r.drivers ?? 0),
    extra_beds:    Number(r.extra_beds ?? 0),
    notes:         r.notes ?? null,
    rooms:         (r.rooms ?? []).map((x) => ({
      room_type:    x.room_type,
      qty:          Number(x.qty ?? 0),
      unit_price:   Number(x.unit_price ?? 0),
      room_numbers: x.room_numbers ?? [],
      evening_rooms: x.evening_rooms ?? [],
    })),
  })))
}

/** "Sat 4 Oct" — the prefix on every group line item and itinerary row. */
export function shortDayLabel(isoDate: string): string {
  return new Date(`${isoDate}T12:00:00Z`).toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC',
  })
}

/** Inclusive span of an itinerary in days, for summaries. */
export function itinerarySpanDays(segments: GroupSegment[]): number {
  const dates = distinctDates(segments)
  if (dates.length === 0) return 0
  return daysBetweenIso(dates[0], dates[dates.length - 1]) + 1
}
