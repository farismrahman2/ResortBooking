import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkAvailabilityConflict, getBookedRoomNumbers } from '@/lib/queries/availability'
import { calculateDaylong, calculateNight } from '@/lib/engine/calculator'
import { getHolidayDateStrings } from '@/lib/queries/settings'
import type { RoomType } from '@/lib/supabase/types'

/**
 * GET /api/date-change-preview?bookingId=X&visitDate=YYYY-MM-DD&checkOutDate=YYYY-MM-DD
 *
 * Preview what happens if a booking's dates change:
 * - availability check (excludes self)
 * - conflicting room numbers on new dates
 * - recalculated pricing with new dates
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const bookingId   = searchParams.get('bookingId')
  const visitDate   = searchParams.get('visitDate')
  const checkOutDate = searchParams.get('checkOutDate') || null

  if (!bookingId || !visitDate) {
    return NextResponse.json({ error: 'bookingId and visitDate are required' }, { status: 400 })
  }

  try {
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any

    // Fetch booking with rooms
    const { data: booking, error: bErr } = await db
      .from('bookings')
      .select('*')
      .eq('id', bookingId)
      .single()

    if (bErr || !booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
    }

    const { data: rooms } = await db
      .from('booking_rooms')
      .select('*')
      .eq('booking_id', bookingId)

    const bookingRooms = (rooms ?? []) as { room_type: RoomType; qty: number; unit_price: number; room_numbers: string[] }[]

    // 1. Availability check (excluding this booking)
    const requestedRooms = bookingRooms.map((r) => ({ room_type: r.room_type, qty: r.qty }))
    const conflictMessage = await checkAvailabilityConflict(
      visitDate,
      checkOutDate,
      requestedRooms,
      bookingId,
    )

    // 2. Find conflicting room numbers on new dates
    const takenRoomNumbers = await getBookedRoomNumbers(visitDate, checkOutDate, bookingId)

    const conflictingRoomNumbers: Record<string, string[]> = {}
    for (const r of bookingRooms) {
      const conflicts = (r.room_numbers ?? []).filter((num: string) => takenRoomNumbers.includes(num))
      if (conflicts.length > 0) {
        conflictingRoomNumbers[r.room_type] = conflicts
      }
    }

    // 3. Recalculate pricing with new dates using frozen snapshot
    const snap = booking.package_snapshot
    const holidayDates = await getHolidayDateStrings()

    const roomInputs = bookingRooms.map((r) => ({
      room_type:    r.room_type,
      display_name: r.room_type.replace(/_/g, ' '),
      qty:          r.qty,
      unit_price:   r.unit_price,
    }))

    const extraItems = booking.extra_items ?? []
    const storedPct = booking.discount_pct ?? 0
    const storedPctAmount = Math.round(booking.subtotal * storedPct / 100)
    const flatDiscount = Math.max(0, booking.discount - storedPctAmount)

    let newCalc
    if (booking.package_type === 'daylong') {
      newCalc = calculateDaylong({
        date:               new Date(visitDate + 'T00:00:00'),
        packageRates:       snap,
        rooms:              roomInputs,
        adults:             booking.adults,
        children_paid:      booking.children_paid,
        children_free:      booking.children_free,
        drivers:            booking.drivers,
        holidayDates,
        discount:           flatDiscount,
        discount_pct:       storedPct,
        service_charge_pct: booking.service_charge_pct ?? 0,
        advance_required:   booking.advance_required,
        advance_paid:       booking.advance_paid,
        extra_items:        extraItems,
      })
    } else {
      if (!checkOutDate) {
        return NextResponse.json({ error: 'checkOutDate required for night stays' }, { status: 400 })
      }
      newCalc = calculateNight({
        checkInDate:        new Date(visitDate + 'T00:00:00'),
        checkOutDate:       new Date(checkOutDate + 'T00:00:00'),
        packageRates:       snap,
        rooms:              roomInputs,
        adults:             booking.adults,
        children_paid:      booking.children_paid,
        children_free:      booking.children_free,
        drivers:            booking.drivers,
        extra_beds:         booking.extra_beds,
        holidayDates,
        discount:           flatDiscount,
        discount_pct:       storedPct,
        service_charge_pct: booking.service_charge_pct ?? 0,
        advance_required:   booking.advance_required,
        advance_paid:       booking.advance_paid,
        extra_items:        extraItems,
      })
    }

    return NextResponse.json({
      available:              !conflictMessage,
      conflict_message:       conflictMessage,
      conflicting_room_numbers: conflictingRoomNumbers,
      old_total:              booking.total,
      new_total:              newCalc.total,
      new_subtotal:           newCalc.subtotal,
      new_discount:           newCalc.discount,
      new_remaining:          newCalc.remaining,
      rate_used:              newCalc.adult_rate_used,
      nights:                 newCalc.nights,
      advance_paid:           booking.advance_paid,
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
