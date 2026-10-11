import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { withDeadline } from '@/lib/supabase/deadline'

export const dynamic = 'force-dynamic'

/**
 * GET /api/health — can the app reach its database right now?
 * Public (no session): the outage page polls it, and an uptime monitor can.
 * Answers 200 { ok: true, ms } or 503 { ok: false } within ~4 seconds.
 */
export async function GET() {
  const t0 = Date.now()
  try {
    const { error } = await withDeadline(
      Promise.resolve(createServiceClient().from('settings').select('key').limit(1)),
      4000, 'health check',
    )
    if (error) throw error
    return NextResponse.json({ ok: true, ms: Date.now() - t0 }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    return NextResponse.json(
      { ok: false, ms: Date.now() - t0, error: err instanceof Error ? err.message : String(err) },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}
