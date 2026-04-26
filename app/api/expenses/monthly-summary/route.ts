import { NextRequest, NextResponse } from 'next/server'
import { getMonthlyExpenseSummary } from '@/lib/queries/expenses'

/**
 * GET /api/expenses/monthly-summary?month=YYYY-MM
 *
 * Returns the Excel-style pivot for one month: categories (column order),
 * one row per day with cells keyed by category slug, column totals, grand total.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const month = searchParams.get('month')

  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: 'month must be YYYY-MM' }, { status: 400 })
  }

  try {
    const summary = await getMonthlyExpenseSummary(month)
    return NextResponse.json(summary)
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
