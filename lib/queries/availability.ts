import { createClient } from '@/lib/supabase/server'
import { checkRoomAvailability } from '@/lib/engine/availability'
import { nextDay } from '@/lib/config/rooms'
import type { AvailabilityResult, RoomInventoryRow, RoomType } from '@/lib/supabase/types'
import type { OccupiedRoom } from '@/lib/engine/availability'

/** Get room availability for a single date */
export async function getRoomAvailability(
  date: string,   // ISO date
  inventory: RoomInventoryRow[],
  packageType?: 'daylong' | 'night',
): Promise<AvailabilityResult[]> {
  const supabase = createClient()

  // Query bookings that overlap with this date
  const { data: bookingOccupied } = await supabase
    .from('booking_rooms')
    .select('room_type, qty, bookings!inner(visit_date, check_out_date, status)')
    .filter('bookings.visit_date', 'lte', date)
    .filter('bookings.status', 'neq', 'cancelled')

  // Query confirmed quotes that overlap with this date
  // Exclude quotes that have already been converted to a booking (they'd be double-counted)
  const { data: quoteOccupied } = await supabase
    .from('quote_rooms')
    .select('room_type, qty, quotes!inner(visit_date, check_out_date, status, converted_to_booking_id)')
    .filter('quotes.visit_date', 'lte', date)
    .eq('quotes.status', 'confirmed')
    .is('quotes.converted_to_booking_id', null)

  // Merge and filter by actual date overlap
  const occupied: OccupiedRoom[] = []

  for (const row of bookingOccupied ?? []) {
    const booking = (row as any).bookings
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

  let query = supabase
    .from('booking_rooms')
    .select('room_numbers, bookings!inner(id, visit_date, check_out_date, status)')
    .neq('bookings.status', 'cancelled')

  if (excludeBookingId) {
    query = query.neq('bookings.id', excludeBookingId)
  }

  const { data } = await query

  const aStart = visitDate
  const aEnd   = checkOutDate ?? nextDay(visitDate)

  const taken: string[] = []
  for (const row of data ?? []) {
    const b = (row as any).bookings
    const bStart = b.visit_date
    const bEnd   = b.check_out_date ?? nextDay(b.visit_date)
    // Overlap check: [aStart, aEnd) ∩ [bStart, bEnd) ≠ ∅
    if (aStart < bEnd && bStart < aEnd) {
      taken.push(...((row as any).room_numbers ?? []))
    }
  }

  return taken
}
