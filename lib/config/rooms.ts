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

/** Guests a room of this type includes before extra persons are charged. */
export function includedPersons(roomType: string): number {
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
