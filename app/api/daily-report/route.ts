import { NextRequest, NextResponse } from 'next/server'
import { getDailyReport } from '@/lib/queries/daily-report'

export async function GET(req: NextRequest) {
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
