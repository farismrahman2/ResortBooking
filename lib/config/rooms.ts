import type { RoomType } from '@/lib/supabase/types'

/**
 * Fixed room number assignments per room type.
 * Edit this file to add/remove room numbers — no other code changes needed.
 */
export const ROOM_NUMBERS: Partial<Record<RoomType, string[]>> = {
  super_premium:  ['101'],
  premium:        ['102'],
  cottage:        ['103', '104', '105', '106', '107'],
  premium_deluxe: ['108'],
  deluxe:         ['202', '203', '205', '206', '301', '302'],
  eco_deluxe:     ['204', '207'],
  // tree_house: no fixed room numbers assigned
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
