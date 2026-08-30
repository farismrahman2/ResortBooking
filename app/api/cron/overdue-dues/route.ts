import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { createServiceClient } from '@/lib/supabase/server'
import { flagOverdueDues, DUE_ALERT_MIN_DAYS } from '@/lib/alerts/overdue-dues'

export const dynamic = 'force-dynamic'

/** Constant-time string compare (avoids leaking the secret via timing). */
function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  return ba.length === bb.length && timingSafeEqual(ba, bb)
}

/**
 * GET /api/cron/overdue-dues
 *
 * Scheduled daily by Vercel Cron (see vercel.json). Raises an audit-log entry
 * for each departed guest whose balance has gone unpaid past the threshold.
 *
 * The Audit Log page runs the same scan when it is opened, so this exists for
 * the case that matters more: nobody has opened it. Without the cron the
 * sidebar's unread badge would only light up after someone already went
 * looking, which defeats the point of an alert.
 *
 * Vercel attaches `Authorization: Bearer ${CRON_SECRET}` automatically when
 * CRON_SECRET is set — anything else is rejected. Uses the service-role client
 * so it can read across all rows without a signed-in user.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization')
  if (!secret || !auth || !safeEqual(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await flagOverdueDues(createServiceClient())
    return NextResponse.json({
      ok: true,
      threshold_days: DUE_ALERT_MIN_DAYS,
      ...result,
    })
  } catch (err) {
    console.error('[cron/overdue-dues] failed:', err)
    return NextResponse.json({ error: 'Internal error scanning dues' }, { status: 500 })
  }
}
