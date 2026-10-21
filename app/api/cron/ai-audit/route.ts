import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual, createHash } from 'crypto'
import { createServiceClient } from '@/lib/supabase/server'
import { todayDhaka } from '@/lib/dates'
import { runDaily, submitPeriodic, collectBatches, dueOn, type Agent } from '@/lib/audit/agents'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  return ba.length === bb.length && timingSafeEqual(ba, bb)
}

/** A one-off run token (ai_audit_run_tokens: its sha256, with an expiry) lets
 *  an operator trigger a run without knowing CRON_SECRET. Each token works once. */
async function runTokenOk(auth: string | null): Promise<boolean> {
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : ''
  if (token.length < 32) return false
  const hash = createHash('sha256').update(token).digest('hex')
  const db = createServiceClient({ fresh: true }) as any   // eslint-disable-line @typescript-eslint/no-explicit-any
  const { data } = await db.from('ai_audit_run_tokens').delete().eq('token_hash', hash).gt('expires_at', new Date().toISOString()).select('token_hash')
  return (data ?? []).length > 0
}

/**
 * GET /api/cron/ai-audit — once a day (vercel.json). Collects any finished
 * weekly/monthly batch, runs the daily checker, and on Sundays / the 1st also
 * submits the weekly / monthly report. One cron for all agents keeps within
 * Vercel's cron allowance.
 *
 * Same CRON_SECRET guard as /api/cron/overdue-dues.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization')
  const cron = !!secret && !!auth && safeEqual(auth, `Bearer ${secret}`)
  if (!cron && !(await runTokenOk(auth))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const today = todayDhaka()
  // ?run=weekly|monthly forces that report too (manual runs only).
  const force = cron ? null : req.nextUrl.searchParams.get('run')
  try {
    const collected = await collectBatches()
    const ran = []
    const extra: Agent[] = force === 'weekly' || force === 'monthly' ? [force] : []
    for (const agent of new Set<Agent>([...dueOn(today), ...extra])) {
      ran.push(agent === 'daily' ? await runDaily(today, cron ? 'cron' : 'manual') : await submitPeriodic(agent, today, cron ? 'cron' : 'manual'))
    }
    return NextResponse.json({ ok: true, today, collected, ran })
  } catch (err) {
    console.error('[cron/ai-audit] failed:', err)
    return NextResponse.json({ error: 'AI audit run failed' }, { status: 500 })
  }
}
