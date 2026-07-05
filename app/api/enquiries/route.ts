import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { createServiceClient } from '@/lib/supabase/server'
import { enquiryIngestSchema } from '@/lib/validators/enquiries'

export const dynamic = 'force-dynamic'

/** Constant-time compare (avoids leaking the secret via timing). */
function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  return ba.length === bb.length && timingSafeEqual(ba, bb)
}

/**
 * POST /api/enquiries
 *
 * Server-to-server ingest for leads submitted on the public marketing website
 * (garden-centre-resort). The public site POSTs each lead here right after it
 * persists its own copy, so the two apps stay independent and staff also see
 * every lead in the Resort Agent back-office.
 *
 * Auth: `Authorization: Bearer ${ENQUIRY_INGEST_SECRET}`. Uses the service-role
 * client (RLS bypass) since there is no logged-in user on a machine-to-machine
 * call. Idempotent: upserts on `source_id`, so retries/edits don't duplicate.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.ENQUIRY_INGEST_SECRET
  const auth = req.headers.get('authorization')
  if (!secret || !auth || !safeEqual(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  const parsed = enquiryIngestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid', issues: parsed.error.flatten() },
      { status: 400 },
    )
  }
  const d = parsed.data

  const row = {
    source_id:    d.sourceId,
    type:         d.type,
    date_text:    d.date || null,
    pax:          d.pax,
    organisation: d.organisation || null,
    name:         d.name,
    phone:        d.phone,
    email:        d.email || null,
    note:         d.note || null,
    source:       d.source ?? null,
    submitted_at: d.submittedAt ?? null,
  }

  try {
    const db = createServiceClient()
    // Upsert on source_id. New leads default status='new' and seen_at=null
    // (so they light up the sidebar badge). onConflict re-syncs an edited lead
    // WITHOUT touching status/seen_at/staff_notes — those are staff-owned once
    // the lead is in the back-office, so a public-side re-push must not reset
    // them. We only send the columns present in `row`, so the DB keeps the
    // staff-owned columns as they are on conflict.
    const { error } = await db
      .from('enquiries')
      .upsert(row, { onConflict: 'source_id' })
    if (error) {
      console.error('[enquiries ingest] upsert failed:', error.message)
      return NextResponse.json({ error: 'db_failed' }, { status: 500 })
    }
  } catch (err) {
    console.error('[enquiries ingest] unexpected error:', err)
    return NextResponse.json({ error: 'db_failed' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
