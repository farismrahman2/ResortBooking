import type { RoomType } from '@/lib/supabase/types'

/**
 * Fixed room number assignments per room type.
 * Edit this file to add/remove room numbers — no other code changes needed.
 *
 * Physical rooms only. A composite (below) has no numbers of its own; it is
 * sold as one unit but occupies the physical rooms it is made of.
 */
export const ROOM_NUMBERS: Partial<Record<RoomType, string[]>> = {
  super_premium:   ['101'],
  premium:         ['102'],
  cottage:         ['103', '104', '105', '106', '107'],
  premium_deluxe:  ['108'],
  deluxe:          ['202', '205', '301', '302'],
  superior_deluxe: ['203', '206'],
  eco_deluxe:      ['204', '207'],
  // Canopy building — five floors of five: x11 Super Premium Canopy (floors
  // 2–5; 111 is a Premium Deluxe Canopy), x12–x14 Premium Deluxe Canopy,
  // x15 Deluxe Canopy. Floors not yet open are held by a room block.
  super_premium_canopy:  ['211', '311', '411', '511'],
  premium_deluxe_canopy: ['111', '112', '113', '114', '212', '213', '214', '312', '313', '314', '412', '413', '414', '512', '513', '514'],
  deluxe_canopy:         ['115', '215', '315', '415', '515'],
  conference_room:       ['Conference'],
  // tree_house: no fixed room numbers assigned
}

/**
 * A room type sold as one unit that is really several physical rooms of
 * another type — the two-bedroom villa is Deluxe 301 + 302 sold together.
 *
 * Booking the composite takes every component room; booking any component
 * on its own makes the composite unavailable. The engine expands a composite
 * into its components for every occupancy check (lib/engine/halves.ts), so
 * the two ways of selling the same rooms can never double-book.
 */
export interface CompositeRoom {
  component_type:   RoomType
  room_numbers:     string[]
  /** Guests included before extra-person charges apply (a plain room includes 2). */
  included_persons: number
}

export const COMPOSITE_ROOMS: Partial<Record<RoomType, CompositeRoom>> = {
  villa_2br: { component_type: 'deluxe', room_numbers: ['301', '302'], included_persons: 4 },
}

export const isComposite = (roomType: string): boolean => roomType in COMPOSITE_ROOMS

/**
 * WHOLE-DAY rooms are sold by the day with a package, not as a bedroom: the
 * conference room. It has no day/night halves and no evening handover — it
 * is held for the whole of the guests' arrival date (a day visit's date, a
 * night stay's check-in date) and for no later night. Priced per day at
 * whatever the agent types in; it sleeps nobody, so it includes no guests
 * and is not counted as a room in occupancy.
 */
export const WHOLE_DAY_ROOMS: ReadonlySet<string> = new Set(['conference_room'])

export const isWholeDay = (roomType: string): boolean => WHOLE_DAY_ROOMS.has(roomType)

/** A bedroom guests sleep in — what occupancy counts. */
export const isGuestRoom = (roomType: string): boolean => !isWholeDay(roomType)

/** Nights a room line is charged for: once, per day, for a whole-day room. */
export function chargedNights(roomType: string, nights: number): number {
  return isWholeDay(roomType) ? 1 : nights
}

/** Guests a room of this type includes before extra persons are charged. */
export function includedPersons(roomType: string): number {
  if (isWholeDay(roomType)) return 0
  return COMPOSITE_ROOMS[roomType as RoomType]?.included_persons ?? 2
}

/** The physical rooms a booking of this type can name — its own numbers, or
 *  the composite's components. Empty for types without fixed numbers. */
export function physicalRoomNumbers(roomType: string): string[] {
  return COMPOSITE_ROOMS[roomType as RoomType]?.room_numbers ?? ROOM_NUMBERS[roomType as RoomType] ?? []
}

/** How many room numbers a row of `qty` units must carry: one per unit, or
 *  every component per composite unit. 0 when the type has no fixed numbers. */
export function requiredRoomNumbers(roomType: string, qty: number): number {
  const comp = COMPOSITE_ROOMS[roomType as RoomType]
  if (comp) return qty * comp.room_numbers.length
  return (ROOM_NUMBERS[roomType as RoomType] ?? []).length > 0 ? qty : 0
}

/** Reverse lookup: room number → room type */
export const ROOM_NUMBER_TO_TYPE: Record<string, RoomType> = Object.entries(ROOM_NUMBERS).reduce(
  (acc, [roomType, numbers]) => {
    for (const num of numbers ?? []) acc[num] = roomType as RoomType
    return acc
  },
  {} as Record<string, RoomType>,
)

/** Add 1 day to an ISO date string (YYYY-MM-DD) */
export function nextDay(date: string): string {
  const d = new Date(date + 'T00:00:00')
  d.setDate(d.getDate() + 1)
  return d.toISOString().slice(0, 10)
}

/** Check if two bookings' date ranges overlap (rooms can't be double-booked) */
export function dateRangesOverlap(
  aVisit: string, aCheckOut: string | null,
  bVisit: string, bCheckOut: string | null,
): boolean {
  // Treat daylong as a [visit, visit+1day) range for overlap detection
  const aStart = aVisit
  const aEnd   = aCheckOut ?? nextDay(aVisit)
  const bStart = bVisit
  const bEnd   = bCheckOut ?? nextDay(bVisit)
  return aStart < bEnd && bStart < aEnd
}

// ─── Buildings and floors (display only) ─────────────────────────────────────
//
// Which building and floor a room number is on — used to group pickers and
// lists, never by the availability or pricing rules. Canopy rooms are x11–x15
// (floor = first digit); every other numbered room is in the main building.

export type Building = 'main' | 'canopy' | 'other'

export const BUILDING_LABEL: Record<Building, string> = { main: 'Main', canopy: 'Canopy', other: 'Other' }
const BUILDING_ORDER: Building[] = ['main', 'canopy', 'other']

export function roomLocation(num: string): { building: Building; floor: number | null } {
  if (/^\d1[1-5]$/.test(num)) return { building: 'canopy', floor: Number(num[0]) }
  if (/^\d{3}$/.test(num))    return { building: 'main',   floor: Number(num[0]) }
  return { building: 'other', floor: null }
}

/** The building a room TYPE lives in (by its first room), for grouping cards. */
export function roomTypeBuilding(roomType: string): Building {
  const nums = physicalRoomNumbers(roomType)
  return nums.length ? roomLocation(nums[0]).building : 'main'
}

const cmpRoom = (a: string, b: string) => {
  const an = parseInt(a, 10), bn = parseInt(b, 10)
  return Number.isFinite(an) && Number.isFinite(bn) && an !== bn ? an - bn : a.localeCompare(b)
}

/** Every real room number, sorted — runs are only drawn over rooms that exist. */
const ALL_ROOMS: string[] = [...new Set(Object.values(ROOM_NUMBERS).flatMap((n) => n ?? []))].sort(cmpRoom)

/** "103–106, 202" — three or more rooms that are next to each other in the
 *  building's own numbering become a range; 202 and 205 stay apart because
 *  203 and 204 exist. `fmt` localises each number (Bangla digits). */
function runs(nums: string[], fmt: (n: string) => string): string[] {
  const order = new Map(ALL_ROOMS.map((n, i) => [n, i]))
  const sorted = [...nums].sort(cmpRoom)
  const out: string[] = []
  let run: string[] = []
  const flush = () => {
    if (run.length >= 3) out.push(`${fmt(run[0])}–${fmt(run[run.length - 1])}`)
    else out.push(...run.map(fmt))
    run = []
  }
  for (const n of sorted) {
    const prev = run[run.length - 1]
    const adjacent = prev !== undefined && order.has(n) && order.has(prev)
      && order.get(n)! === order.get(prev)! + 1
      && roomLocation(n).building === roomLocation(prev).building
    if (!adjacent) flush()
    run.push(n)
  }
  flush()
  return out
}

/**
 * A list of room numbers for people: grouped by building, runs shortened, and
 * a Canopy floor that is wholly in the list named as a floor.
 *   ['103','104','105','106','202','212','213','214','215','311',…,'515']
 *   → "Main 103–106, 202 · Canopy floors 3–5, 212–215"
 */
export interface RoomListFormat {
  /** Localise a number (Bangla digits). */
  fmt?:      (n: string) => string
  /** Building name before its rooms ("Main", "মূল ভবন"). */
  building?: (b: Building) => string
  /** A whole floor or a run of floors ("floor 2", "floors 3–5"). */
  floors?:   (from: string, to: string | null) => string
}

export function formatRoomList(nums: string[], opts: RoomListFormat = {}): string {
  const fmt      = opts.fmt ?? ((n: string) => n)
  const building = opts.building ?? ((b: Building) => BUILDING_LABEL[b])
  const floorTxt = opts.floors ?? ((a: string, z: string | null) => (z ? `floors ${a}–${z}` : `floor ${a}`))
  const by = new Map<Building, string[]>()
  for (const n of new Set(nums)) {
    const b = roomLocation(n).building
    by.set(b, [...(by.get(b) ?? []), n])
  }
  const parts: string[] = []
  for (const b of BUILDING_ORDER) {
    const list = by.get(b)
    if (!list?.length) continue
    let rest = list
    const bits: string[] = []
    if (b === 'canopy') {
      // Whole floors first: "floors 3–5".
      const floors = [...new Set(ALL_ROOMS.filter((n) => roomLocation(n).building === 'canopy').map((n) => roomLocation(n).floor!))].sort()
      const full = floors.filter((f) => {
        const onFloor = ALL_ROOMS.filter((n) => roomLocation(n).building === 'canopy' && roomLocation(n).floor === f)
        return onFloor.every((n) => list.includes(n))
      })
      if (full.length) {
        const groups: number[][] = []
        for (const f of full) {
          const g = groups[groups.length - 1]
          if (g && g[g.length - 1] === f - 1) g.push(f); else groups.push([f])
        }
        for (const g of groups) {
          bits.push(floorTxt(fmt(String(g[0])), g.length === 1 ? null : fmt(String(g[g.length - 1]))))
        }
        rest = list.filter((n) => !full.includes(roomLocation(n).floor!))
      }
    }
    bits.push(...runs(rest, fmt))
    parts.push(b === 'other' ? bits.join(', ') : `${building(b)} ${bits.join(', ')}`)
  }
  return parts.join(' · ')
}
