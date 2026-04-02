import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkRoomAvailability } from '@/lib/engine/availability'
import type { RoomType, AvailabilityResult } from '@/lib/supabase/types'
import type { OccupiedRoom } from '@/lib/engine/availability'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const date  = searchParams.get('date')
  const from  = searchParams.get('from')
  const to    = searchParams.get('to')
  const type  = searchParams.get('type') as 'daylong' | 'night' | null

  if (!date && !(from && to)) {
    return NextResponse.json({ error: 'Provide ?date= or ?from=&to= params' }, { status: 400 })
  }

  try {
    const supabase = createClient()

    const { data: inventory, error: invError } = await supabase
      .from('room_inventory')
      .select('*')
      .order('display_order')

    if (invError || !inventory) {
      return NextResponse.json({ error: 'Failed to fetch inventory' }, { status: 500 })
    }

    const packageType = type === 'daylong' || type === 'night' ? type : undefined

    if (date) {
      const occupied = await getOccupiedForDate(supabase, date)
      const rooms = checkRoomAvailability(inventory, occupied, packageType)
      return NextResponse.json({ rooms, date })
    }

    // Range path — RPC
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rpcData, error: rpcError } = await (supabase as any).rpc('get_availability_range', {
      p_from: from!,
      p_to: to!,
    })

    if (rpcError) {
      return NextResponse.json({ error: rpcError.message }, { status: 500 })
    }

    const byDate = new Map<string, OccupiedRoom[]>()
    for (const row of rpcData ?? []) {
      const dateStr = String(row.check_date)
      const existing = byDate.get(dateStr) ?? []
      existing.push({ room_type: row.check_room_type as RoomType, qty_booked: Number(row.qty_booked) })
      byDate.set(dateStr, existing)
    }

    const dates: { date: string; rooms: AvailabilityResult[] }[] = []
    for (const [d, occupied] of byDate) {
      dates.push({ date: d, rooms: checkRoomAvailability(inventory, occupied, packageType) })
    }
    dates.sort((a, b) => a.date.localeCompare(b.date))

    return NextResponse.json({ dates, from, to })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

async function getOccupiedForDate(
  supabase: ReturnType<typeof createClient>,
  date: string,
): Promise<OccupiedRoom[]> {
  const occupied: OccupiedRoom[] = []

  const { data: bookingRooms } = await supabase
    .from('booking_rooms')
    .select('room_type, qty, bookings!inner(visit_date, check_out_date, status)')
    .neq('bookings.status', 'cancelled')

  for (const row of bookingRooms ?? []) {
    const b = (row as any).bookings
    const blocksDate = b.check_out_date
      ? b.visit_date <= date && b.check_out_date > date
      : b.visit_date === date
    if (blocksDate) {
      occupied.push({ room_type: row.room_type as RoomType, qty_booked: row.qty })
    }
  }

  const { data: quoteRooms } = await supabase
    .from('quote_rooms')
    .select('room_type, qty, quotes!inner(visit_date, check_out_date, status, converted_to_booking_id)')
    .eq('quotes.status', 'confirmed')
    .is('quotes.converted_to_booking_id', null)  // exclude already-converted quotes (booking counts them)

  for (const row of quoteRooms ?? []) {
    const q = (row as any).quotes
    const blocksDate = q.check_out_date
      ? q.visit_date <= date && q.check_out_date > date
      : q.visit_date === date
    if (blocksDate) {
      occupied.push({ room_type: row.room_type as RoomType, qty_booked: row.qty })
    }
  }

  return occupied
}
