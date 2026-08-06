import { NextRequest, NextResponse } from 'next/server'
import { getDailyReport } from '@/lib/queries/daily-report'
import { getCurrentUserContext } from '@/lib/auth/permissions'

export async function GET(req: NextRequest) {
  // Was unauthenticated beyond the middleware's blanket 401 — see the note in
  // app/api/expenses/csv-export/route.ts.
  const ctx = await getCurrentUserContext()
  if (!ctx) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const lvl = ctx.permissions.bookings
  if (lvl !== 'read' && lvl !== 'write') {
    return NextResponse.json({ error: 'Bookings access required' }, { status: 403 })
  }

  const date = req.nextUrl.searchParams.get('date')
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'Invalid or missing ?date=YYYY-MM-DD' }, { status: 400 })
  }
  try {
    const rows = await getDailyReport(date)
    return NextResponse.json({ date, rows })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
