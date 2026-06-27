import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { createServiceClient } from '@/lib/supabase/server'
import {
  upsertCorporateSnapshot,
  todayDhaka,
  shiftDhakaDate,
  isValidDhakaDate,
} from '@/lib/queries/reports/corporate-daily'

export const dynamic = 'force-dynamic'

/** Constant-time string compare (avoids leaking the secret via timing). */
function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  return ba.length === bb.length && timingSafeEqual(ba, bb)
}

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
  if (!secret || !auth || !safeEqual(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Optional ?date= backfill: must be a real calendar date, not in the future.
  const today = todayDhaka()
  const param = req.nextUrl.searchParams.get('date')
  if (param !== null && !(isValidDhakaDate(param) && param <= today)) {
    return NextResponse.json({ error: 'Invalid ?date — expected a real YYYY-MM-DD not in the future' }, { status: 400 })
  }
  const date = param ?? shiftDhakaDate(today, -1)

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
    // Log details server-side; don't leak schema/internals to the caller.
    console.error('[cron/corporate-snapshot] failed:', err)
    return NextResponse.json({ error: 'Internal error generating snapshot' }, { status: 500 })
  }
}
