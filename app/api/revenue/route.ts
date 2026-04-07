import { NextRequest, NextResponse } from 'next/server'
import { getRevenueStats } from '@/lib/queries/bookings'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const from_date = searchParams.get('from') ?? new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10)
  const to_date   = searchParams.get('to')   ?? new Date().toISOString().slice(0, 10)
  const type      = (searchParams.get('type') ?? 'all') as 'daylong' | 'night' | 'all'

  const stats = await getRevenueStats({ from_date, to_date, type })
  return NextResponse.json(stats)
}
