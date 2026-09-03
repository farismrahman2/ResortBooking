import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getRoomAvailability, rangeRowsToResults } from '@/lib/queries/availability'
import type { RoomInventoryRow } from '@/lib/supabase/types'

export const dynamic = 'force-dynamic'

/**
 * GET /api/availability?date=YYYY-MM-DD[&type=daylong|night]
 * GET /api/availability?from=YYYY-MM-DD&to=YYYY-MM-DD[&type=…]
 *
 * Both paths answer per half of the day: `type=daylong` reads the day half,
 * `type=night` the night half, and no type reads the night half while
 * carrying both (`booked_day` / `booked_night`) so the calendar can show
 * where they differ — a room handed over in the evening is free by day and
 * taken by night.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const date = searchParams.get('date')
  const from = searchParams.get('from')
  const to   = searchParams.get('to')
  const type = searchParams.get('type')
  const packageType = type === 'daylong' || type === 'night' ? type : undefined

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
    const inv = inventory as RoomInventoryRow[]

    if (date) {
      const rooms = await getRoomAvailability(date, inv, packageType)
      return NextResponse.json({ rooms, date })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rpcData, error: rpcError } = await (supabase as any).rpc('get_availability_range', {
      p_from: from!, p_to: to!,
    })
    if (rpcError) return NextResponse.json({ error: rpcError.message }, { status: 500 })

    const byDate = rangeRowsToResults(rpcData ?? [], inv, packageType)
    const dates = [...byDate.entries()]
      .map(([d, rooms]) => ({ date: d, rooms }))
      .sort((a, b) => a.date.localeCompare(b.date))
    return NextResponse.json({ dates, from, to })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
