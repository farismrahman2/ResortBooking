import { NextRequest, NextResponse } from 'next/server'
import { getRoomInventory } from '@/lib/queries/settings'
import { getRoomAvailability, getAvailabilityRange } from '@/lib/queries/availability'
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
    // Reference data, from the shared cache rather than a round trip per call.
    let inv: RoomInventoryRow[]
    try { inv = await getRoomInventory() } catch {
      return NextResponse.json({ error: 'Failed to fetch inventory' }, { status: 500 })
    }

    if (date) {
      const rooms = await getRoomAvailability(date, inv, packageType)
      return NextResponse.json({ rooms, date })
    }

    const byDate = await getAvailabilityRange(from!, to!, inv, packageType)
    const dates = [...byDate.entries()]
      .map(([d, rooms]) => ({ date: d, rooms }))
      .sort((a, b) => a.date.localeCompare(b.date))
    return NextResponse.json({ dates, from, to })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
