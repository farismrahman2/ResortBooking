import { NextRequest, NextResponse } from 'next/server'
import { getRoomNumberBuckets } from '@/lib/queries/availability'

/**
 * GET /api/booked-room-numbers?visitDate=…[&checkOutDate=…][&excludeId=…]
 *
 * Room numbers for the picker, sorted by what a request on these dates can
 * do with them. `takenRoomNumbers` / `noonRoomNumbers` keep their old names;
 * `eveningOnlyRoomNumbers` (night stays: held by day guests on arrival day —
 * pick as an evening-handover room) and `untilEveningRoomNumbers` (day
 * visits: a night guest arrives in the evening) are new.
 */
export async function GET(req: NextRequest) {
  const visitDate    = req.nextUrl.searchParams.get('visitDate')
  const checkOutDate = req.nextUrl.searchParams.get('checkOutDate') || null
  const excludeId    = req.nextUrl.searchParams.get('excludeId')    || undefined

  if (!visitDate || !/^\d{4}-\d{2}-\d{2}$/.test(visitDate)) {
    return NextResponse.json({ error: 'Invalid or missing ?visitDate=YYYY-MM-DD' }, { status: 400 })
  }

  try {
    const b = await getRoomNumberBuckets(visitDate, checkOutDate, excludeId)
    return NextResponse.json({
      takenRoomNumbers:        b.taken,
      noonRoomNumbers:         b.noon,
      eveningOnlyRoomNumbers:  b.eveningOnly,
      untilEveningRoomNumbers: b.untilEvening,
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
