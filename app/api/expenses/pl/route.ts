import { NextRequest, NextResponse } from 'next/server'
import { getProfitAndLoss } from '@/lib/queries/expenses'

/** GET /api/expenses/pl?from=&to= — Profit & Loss for the date range */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const from = searchParams.get('from')
  const to   = searchParams.get('to')

  if (!from || !to || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return NextResponse.json({ error: 'from and to are required, format YYYY-MM-DD' }, { status: 400 })
  }

  try {
    const pl = await getProfitAndLoss(from, to)
    return NextResponse.json(pl)
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
