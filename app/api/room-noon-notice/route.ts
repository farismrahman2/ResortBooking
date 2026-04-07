import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * GET /api/room-noon-notice?visitDate=YYYY-MM-DD&roomTypes=cottage,deluxe
 *
 * Returns { hasConflict: boolean }
 * hasConflict = true when any of the given room types has a night stay
 * with check_out_date == visitDate (previous guest still in room until ~noon).
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const visitDate  = searchParams.get('visitDate')
  const roomTypes  = searchParams.get('roomTypes')?.split(',').filter(Boolean) ?? []

  if (!visitDate || roomTypes.length === 0) {
    return NextResponse.json({ hasConflict: false })
  }

  const supabase = createClient()

  // Check bookings: night stay checking out on this date with matching room types
  const { data: bookingRows } = await supabase
    .from('booking_rooms')
    .select('room_type, bookings!inner(check_out_date, status)')
    .eq('bookings.check_out_date', visitDate)
    .neq('bookings.status', 'cancelled')
    .in('room_type', roomTypes)

  if (bookingRows && bookingRows.length > 0) {
    return NextResponse.json({ hasConflict: true })
  }

  // Also check confirmed quotes (not yet converted)
  const { data: quoteRows } = await supabase
    .from('quote_rooms')
    .select('room_type, quotes!inner(check_out_date, status, converted_to_booking_id)')
    .eq('quotes.check_out_date', visitDate)
    .eq('quotes.status', 'confirmed')
    .is('quotes.converted_to_booking_id', null)
    .in('room_type', roomTypes)

  if (quoteRows && quoteRows.length > 0) {
    return NextResponse.json({ hasConflict: true })
  }

  return NextResponse.json({ hasConflict: false })
}
