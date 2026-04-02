import { NextRequest, NextResponse } from 'next/server'
import { getBookedRoomNumbers } from '@/lib/queries/availability'

export async function GET(req: NextRequest) {
  const visitDate    = req.nextUrl.searchParams.get('visitDate')
  const checkOutDate = req.nextUrl.searchParams.get('checkOutDate') || null
  const excludeId    = req.nextUrl.searchParams.get('excludeId')    || undefined

  if (!visitDate || !/^\d{4}-\d{2}-\d{2}$/.test(visitDate)) {
    return NextResponse.json({ error: 'Invalid or missing ?visitDate=YYYY-MM-DD' }, { status: 400 })
  }

  try {
    const taken = await getBookedRoomNumbers(visitDate, checkOutDate, excludeId)
    return NextResponse.json({ takenRoomNumbers: taken })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
