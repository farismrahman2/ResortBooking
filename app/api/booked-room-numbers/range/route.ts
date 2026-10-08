import { NextRequest, NextResponse } from 'next/server'
import { addDaysIso } from '@/lib/dates'
import { getRoomNumberBuckets, loadStaySnapshot, type RoomNumberBuckets } from '@/lib/queries/availability'

export const dynamic = 'force-dynamic'

const ISO = /^\d{4}-\d{2}-\d{2}$/

/**
 * GET /api/booked-room-numbers/range?dates=YYYY-MM-DD,…[&excludeId=…][&excludeQuoteId=…]
 *
 * The group itinerary editor's room pickers, for every date at once: per
 * date, the buckets for a one-night stay (D → D+1) and for a day visit on D.
 * One fetch of the surrounding stays serves them all — the editor used to
 * make two requests per date, each re-reading the same bookings.
 */
export async function GET(req: NextRequest) {
  const dates = (req.nextUrl.searchParams.get('dates') ?? '').split(',').filter((d) => ISO.test(d)).sort()
  const excludeId      = req.nextUrl.searchParams.get('excludeId')      || undefined
  const excludeQuoteId = req.nextUrl.searchParams.get('excludeQuoteId') || undefined
  if (dates.length === 0 || dates.length > 62) {
    return NextResponse.json({ error: 'Pass ?dates= as 1–62 comma-separated YYYY-MM-DD dates' }, { status: 400 })
  }

  try {
    const snap = await loadStaySnapshot(addDaysIso(dates[0], -1), addDaysIso(dates[dates.length - 1], 2), {
      excludeBookingId: excludeId, excludeQuoteId,
    })
    const shape = (b: RoomNumberBuckets) => ({
      takenRoomNumbers:        b.taken,
      noonRoomNumbers:         b.noon,
      eveningOnlyRoomNumbers:  b.eveningOnly,
      untilEveningRoomNumbers: b.untilEvening,
      blockedRoomReasons:      b.blocked ?? {},
    })
    const out: Record<string, { night: ReturnType<typeof shape>; day: ReturnType<typeof shape> }> = {}
    for (const date of dates) {
      const [night, day] = await Promise.all([
        getRoomNumberBuckets(date, addDaysIso(date, 1), excludeId, excludeQuoteId, snap),
        getRoomNumberBuckets(date, null, excludeId, excludeQuoteId, snap),
      ])
      out[date] = { night: shape(night), day: shape(day) }
    }
    return NextResponse.json({ dates: out })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
