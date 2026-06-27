import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import {
  upsertCorporateSnapshot,
  todayDhaka,
  shiftDhakaDate,
} from '@/lib/queries/reports/corporate-daily'

export const dynamic = 'force-dynamic'

/**
 * GET /api/cron/corporate-snapshot
 *
 * Scheduled daily by Vercel Cron (see vercel.json). Vercel attaches
 * `Authorization: Bearer ${CRON_SECRET}` automatically when CRON_SECRET is set
 * in the project's environment variables — we reject anything else.
 *
 * Default target = yesterday (Asia/Dhaka), i.e. the day that just ended when
 * the job fires at ~01:00 Dhaka. Pass ?date=YYYY-MM-DD to backfill a specific
 * day. Uses the service-role client so it can read across all rows (RLS bypass).
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization')
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const param = req.nextUrl.searchParams.get('date')
  const date = param && /^\d{4}-\d{2}-\d{2}$/.test(param)
    ? param
    : shiftDhakaDate(todayDhaka(), -1)

  try {
    const client = createServiceClient()
    const summary = await upsertCorporateSnapshot(date, null, client)
    return NextResponse.json({
      ok: true,
      date,
      corporate_bookings: summary.corporate_bookings,
      corporate_revenue:  summary.corporate_revenue,
      opportunities_won:  summary.opportunities_won,
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
