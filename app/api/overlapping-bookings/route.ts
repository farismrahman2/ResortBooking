import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { nextDay } from '@/lib/config/rooms'

/**
 * GET /api/overlapping-bookings?bookingId=X
 *
 * Returns confirmed bookings whose date ranges overlap with the given booking,
 * along with their room assignments. Used for "swap between bookings" UI.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const bookingId = searchParams.get('bookingId')

  if (!bookingId) {
    return NextResponse.json({ error: 'bookingId is required' }, { status: 400 })
  }

  try {
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any

    // Fetch source booking
    const { data: source, error: sErr } = await db
      .from('bookings')
      .select('id, visit_date, check_out_date')
      .eq('id', bookingId)
      .single()

    if (sErr || !source) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
    }

    const aStart = source.visit_date
    const aEnd   = source.check_out_date ?? nextDay(source.visit_date)

    // Fetch all confirmed bookings (excluding source and cancelled)
    const { data: allBookings } = await db
      .from('bookings')
      .select('id, booking_number, customer_name, visit_date, check_out_date, status')
      .eq('status', 'confirmed')
      .neq('id', bookingId)

    // Filter by date overlap
    const overlapping = []
    for (const b of allBookings ?? []) {
      const bStart = b.visit_date
      const bEnd   = b.check_out_date ?? nextDay(b.visit_date)
      // Overlap: [aStart, aEnd) ∩ [bStart, bEnd) ≠ ∅
      if (aStart < bEnd && bStart < aEnd) {
        // Fetch rooms for this booking (include id + unit_price so client can distinguish paid/comp rows)
        const { data: rooms } = await db
          .from('booking_rooms')
          .select('id, room_type, qty, unit_price, room_numbers')
          .eq('booking_id', b.id)

        overlapping.push({
          id:             b.id,
          booking_number: b.booking_number,
          customer_name:  b.customer_name,
          visit_date:     b.visit_date,
          check_out_date: b.check_out_date,
          rooms: (rooms ?? []).filter((r: any) => (r.room_numbers ?? []).length > 0),
        })
      }
    }

    return NextResponse.json({ overlapping })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
