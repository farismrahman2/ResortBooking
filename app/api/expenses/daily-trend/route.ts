import { NextRequest, NextResponse } from 'next/server'
import { getDailyExpenseTrend } from '@/lib/queries/expenses'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const from = searchParams.get('from')
  const to   = searchParams.get('to')
  if (!from || !to) {
    return NextResponse.json({ error: 'from and to required' }, { status: 400 })
  }
  try {
    const data = await getDailyExpenseTrend(from, to)
    return NextResponse.json({ rows: data })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
