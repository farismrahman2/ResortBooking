import { NextRequest, NextResponse } from 'next/server'
import { getGuestsOnDate } from '@/lib/queries/availability'
import { getCurrentUserContext } from '@/lib/auth/permissions'

/** Guest counts for one date — the tap-a-date summary on the availability calendar. */
export async function GET(req: NextRequest) {
  const ctx = await getCurrentUserContext()
  if (!ctx) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const lvl = ctx.permissions.availability ?? ctx.permissions.bookings
  if (lvl !== 'read' && lvl !== 'write') {
    return NextResponse.json({ error: 'Availability access required' }, { status: 403 })
  }

  const date = req.nextUrl.searchParams.get('date')
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'Invalid or missing ?date=YYYY-MM-DD' }, { status: 400 })
  }
  try {
    return NextResponse.json(await getGuestsOnDate(date))
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
