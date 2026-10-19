/**
 * ROOM BOARD — what is in each physical room on one date, day half and
 * night half, for the visual Room board. Built on occupancyOnDate() from
 * lib/engine/halves.ts so the board can never disagree with availability.
 */

import { occupancyOnDate, type StayLike } from './halves'

export interface BoardStayInput {
  kind:           'booking' | 'quote'
  id?:            string
  ref:            string
  name:           string
  phone?:         string | null
  package_type:   'daylong' | 'night'
  package_name?:  string | null
  group?:         boolean
  visit_date:     string
  check_out_date: string | null
  adults:         number
  children:       number
  drivers:        number
  status?:        string
  remaining?:     number
  corporate?:     boolean
  company?:       string | null
  rooms:          Array<{ room_type: string; qty: number; room_numbers: string[]; evening_rooms?: string[] }>
}

export interface Occupant {
  kind:         'booking' | 'quote'
  id?:          string
  ref:          string
  name:         string
  phone?:       string | null
  packageType:  'daylong' | 'night'
  packageName?: string | null
  group?:       boolean
  visitDate:    string
  checkOutDate: string | null
  adults:       number
  children:     number
  drivers:      number
  status?:      string
  remaining?:   number
  corporate?:   boolean
  company?:     string | null
  /** This booking's numbered rooms on the date — for "rooms together". */
  rooms:        string[]
  /** Night k of n for a night stay (1-based). */
  nightIndex?:  number
  nights?:      number
  /** Handed over at the evening handover on its check-in day. */
  evening:      boolean
}

export interface RoomCell {
  room:      string
  day:       Occupant | null
  night:     Occupant | null
  /** A night guest checking out today (room free after noon). */
  departing: Occupant | null
  blocked:   string | null
}

export interface RoomBoard {
  cells:      Record<string, RoomCell>
  /** Bookings holding rooms without room numbers (count-only, Tree House). */
  unassigned: Array<{ occupant: Occupant; room_type: string; qty: number }>
  counts: {
    freeAllDay: number; freeAfterNoon: number; freeAfterEvening: number; dayOnly: number
    booked: number; blocked: number; guestsTonight: number; arrivals: number; departures: number
  }
}

const daysBetween = (a: string, b: string) =>
  Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000)

export function buildRoomBoard(
  stays: BoardStayInput[], blocked: Record<string, string>, rooms: string[], date: string,
): RoomBoard {
  const cells: Record<string, RoomCell> = {}
  for (const r of rooms) cells[r] = { room: r, day: null, night: null, departing: null, blocked: blocked[r] ?? null }
  const unassigned: RoomBoard['unassigned'] = []
  const tonight = new Set<string>(), arrivals = new Set<string>(), departures = new Set<string>()
  let guestsTonight = 0

  for (const s of stays) {
    const numbered = s.rooms.flatMap((r) => r.room_numbers)
    const nights = s.package_type === 'night' && s.check_out_date ? daysBetween(s.visit_date, s.check_out_date) : undefined
    const base = (evening: boolean): Occupant => ({
      kind: s.kind, id: s.id, ref: s.ref, name: s.name, phone: s.phone, packageType: s.package_type,
      packageName: s.package_name, group: s.group, visitDate: s.visit_date, checkOutDate: s.check_out_date,
      adults: s.adults, children: s.children, drivers: s.drivers, status: s.status, remaining: s.remaining,
      corporate: s.corporate, company: s.company, rooms: numbered, evening,
      nights, nightIndex: nights ? daysBetween(s.visit_date, date) + 1 : undefined,
    })

    // Checking out today: the room is theirs until noon.
    if (s.package_type === 'night' && s.check_out_date === date) {
      if (s.kind === 'booking') departures.add(s.ref)
      for (const n of numbered) if (cells[n] && !cells[n].departing) cells[n].departing = base(false)
      continue
    }

    const stay: StayLike = { package_type: s.package_type, visit_date: s.visit_date, check_out_date: s.check_out_date, rooms: s.rooms }
    const recs = occupancyOnDate(stay, date)
    if (recs.length === 0) continue
    if (s.kind === 'booking' && s.visit_date === date) arrivals.add(s.ref)
    if (s.kind === 'booking' && s.package_type === 'night' && !tonight.has(s.ref)) {
      tonight.add(s.ref); guestsTonight += s.adults + s.children
    }
    for (const rec of recs) {
      if (rec.room_numbers.length === 0) {
        unassigned.push({ occupant: base(false), room_type: rec.room_type, qty: rec.qty })
        continue
      }
      for (const n of rec.room_numbers) {
        const c = cells[n]; if (!c) continue
        const occ = base(rec.night && !rec.day && s.package_type === 'night')
        if (rec.day && !c.day) c.day = occ
        if (rec.night && !c.night) c.night = occ
      }
    }
  }

  const counts = { freeAllDay: 0, freeAfterNoon: 0, freeAfterEvening: 0, dayOnly: 0, booked: 0, blocked: 0,
    guestsTonight, arrivals: arrivals.size, departures: departures.size }
  for (const c of Object.values(cells)) {
    if (c.blocked) { counts.blocked++; continue }
    if (!c.day && !c.night) { if (c.departing) counts.freeAfterNoon++; else counts.freeAllDay++; continue }
    counts.booked++
    if (c.day && !c.night) counts.freeAfterEvening++          // day visitor leaves at the handover
    if (!c.day && c.night) counts.dayOnly++                    // free by day, a night guest arrives
  }
  return { cells, unassigned, counts }
}
