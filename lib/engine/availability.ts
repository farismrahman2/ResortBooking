/**
 * AVAILABILITY ENGINE (pure functions)
 *
 * Takes room inventory + occupied room data and computes availability.
 * The actual DB queries live in lib/queries/availability.ts.
 */

import type { RoomInventoryRow, AvailabilityResult, RoomType } from '@/lib/supabase/types'

export interface OccupiedRoom {
  room_type: RoomType
  qty_booked: number
}

/**
 * Compute availability for a single date given occupied rooms from the DB.
 */
export function checkRoomAvailability(
  inventory: RoomInventoryRow[],
  occupiedRooms: OccupiedRoom[],
  packageType?: 'daylong' | 'night',
): AvailabilityResult[] {
  const occupiedMap = new Map<RoomType, number>()
  for (const occ of occupiedRooms) {
    const current = occupiedMap.get(occ.room_type) ?? 0
    occupiedMap.set(occ.room_type, current + occ.qty_booked)
  }

  return inventory
    .sort((a, b) => a.display_order - b.display_order)
    .map((room) => {
      const booked    = occupiedMap.get(room.room_type) ?? 0
      const available = Math.max(0, room.total_units - booked)

      return {
        room_type:    room.room_type,
        display_name: room.display_name,
        total_units:  room.total_units,
        booked,
        available,
        daylong_only: room.daylong_only,
      }
    })
    .filter((r) => {
      // If checking night availability, exclude daylong-only rooms
      if (packageType === 'night' && r.daylong_only) return false
      return true
    })
}

/**
 * Check if a specific room type is available in the required quantity.
 */
export function isRoomAvailable(
  roomType: RoomType,
  qtyNeeded: number,
  availability: AvailabilityResult[],
): boolean {
  const room = availability.find((r) => r.room_type === roomType)
  return !!room && room.available >= qtyNeeded
}

/**
 * Get a summary: how many room types are available vs fully booked.
 */
export function getAvailabilitySummary(availability: AvailabilityResult[]): {
  available: number
  partial: number
  fullyBooked: number
} {
  let available = 0, partial = 0, fullyBooked = 0
  for (const r of availability) {
    if (r.available === r.total_units) available++
    else if (r.available > 0) partial++
    else fullyBooked++
  }
  return { available, partial, fullyBooked }
}
