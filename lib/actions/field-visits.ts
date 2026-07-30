'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission, getCurrentUserContext } from '@/lib/auth/permissions'
import { fieldVisitDraftSchema, fieldVisitSubmitSchema } from '@/lib/validators/field-visits'
import { formatVisitRef, normaliseMaterials } from '@/lib/field-visits/visit-ref'
import { formatAccountCode } from '@/lib/crm/account-code'
import { getFieldVisitById } from '@/lib/queries/field-visits'
import { isStillSameDayInDhaka } from '@/lib/coffee-shop/timezone'
import type { ActionResult, ActionData } from './types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const dbc = () => createClient() as any

/** Non-fatal history logging — a logging failure must never block the write. */
async function logHistory(
  id: string,
  event: 'created' | 'edited',
  action: string,
  payload: Record<string, unknown> = {},
) {
  try {
    const { error } = await dbc().from('history_log').insert({
      entity_type: 'crm_field_visit',
      entity_id:   id,
      event,
      actor:       'system',
      payload:     { action, ...payload },
    })
    if (error) console.warn(`[history_log] non-fatal: ${error.message}`)
  } catch (err) {
    console.warn('[history_log] non-fatal:', err)
  }
}

/** Creates an empty draft so the wizard has an id to autosave against. */
export async function createDraftVisit(): Promise<ActionData<{ id: string; visit_ref: string }>> {
  await requirePermission('field_visits', 'write')
  try {
    const db  = dbc()
    const ctx = await getCurrentUserContext()

    // Retry on UNIQUE collision — mirrors the account-code pattern.
    let created: { id: string; visit_ref: string } | null = null
    for (let attempt = 0; attempt < 5 && !created; attempt++) {
      const { count } = await db.from('crm_field_visits').select('id', { count: 'exact', head: true })
      const ref = formatVisitRef((count ?? 0) + attempt)
      const { data, error } = await db.from('crm_field_visits')
        .insert({ visit_ref: ref, status: 'draft', created_by: ctx?.user_id ?? null })
        .select('id, visit_ref').single()
      if (!error) { created = data; break }
      if (error.code !== '23505') return { success: false, error: error.message }
    }
    if (!created) return { success: false, error: 'Could not generate a unique visit reference' }

    await logHistory(created.id, 'created', 'draft_created', { visit_ref: created.visit_ref })
    return { success: true, data: created }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * Patch a draft. Deliberately permissive — a rep on flaky mobile data must
 * always be able to save, however incomplete. Never rejects on missing fields.
 */
export async function saveDraftVisit(id: string, partial: unknown): Promise<ActionResult> {
  await requirePermission('field_visits', 'write')
  try {
    const db = dbc()
    const input = fieldVisitDraftSchema.parse(partial ?? {})

    const { data: existing } = await db.from('crm_field_visits')
      .select('status').eq('id', id).maybeSingle()
    if (!existing) return { success: false, error: 'Visit not found' }
    if (existing.status !== 'draft') {
      return { success: false, error: `Cannot edit — this visit is ${existing.status}.` }
    }

    const { contacts, venues, ...visitFields } = input
    // OUT.02 exclusivity enforced server-side too, not just in the UI.
    if (visitFields.materials_given) {
      visitFields.materials_given = normaliseMaterials(visitFields.materials_given)
    }

    const { error } = await db.from('crm_field_visits')
      .update({ ...visitFields, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) return { success: false, error: error.message }

    // Children are replace-all: simplest correct semantics for a wizard that
    // re-sends its whole local state on each autosave.
    if (contacts) {
      await db.from('crm_field_visit_contacts').delete().eq('visit_id', id)
      const rows = contacts
        .filter((c) => c.name || c.designation || c.mobile || c.email)
        .map((c, i) => ({
          visit_id: id, sort_order: i,
          name: c.name ?? null, designation: c.designation ?? null,
          department: c.department ?? null, mobile: c.mobile ?? null,
          email: c.email ?? null, is_decision_maker: c.is_decision_maker ?? false,
        }))
      if (rows.length) await db.from('crm_field_visit_contacts').insert(rows)
    }
    if (venues) {
      await db.from('crm_field_visit_venues').delete().eq('visit_id', id)
      const rows = venues
        .filter((v) => v.venue_name || v.pax || v.rate_per_head || v.feedback)
        .map((v, i) => ({
          visit_id: id, sort_order: i,
          venue_name: v.venue_name ?? null, event_month_year: v.event_month_year ?? null,
          pax: v.pax ?? null, rate_per_head: v.rate_per_head ?? null,
          feedback: v.feedback ?? null,
        }))
      if (rows.length) await db.from('crm_field_visit_venues').insert(rows)
    }

    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/** The only blocking validation in the whole wizard. */
export async function submitFieldVisit(
  id: string,
  gps?: { lat: number; lng: number } | null,
): Promise<ActionData<{ visit_ref: string }>> {
  await requirePermission('field_visits', 'write')
  try {
    const db = dbc()
    const visit = await getFieldVisitById(id)
    if (!visit) return { success: false, error: 'Visit not found' }
    if (visit.status !== 'draft') {
      return { success: false, error: `Already ${visit.status} — nothing to submit.` }
    }

    const parsed = fieldVisitSubmitSchema.safeParse({ ...visit, contacts: visit.contacts })
    if (!parsed.success) {
      const first = parsed.error.issues[0]
      return {
        success: false,
        error: first ? `${first.message}` : 'Some required fields are missing',
      }
    }

    const { error } = await db.from('crm_field_visits').update({
      status:       'submitted',
      submitted_at: new Date().toISOString(),
      gps_lat:      gps?.lat ?? null,
      gps_lng:      gps?.lng ?? null,
      updated_at:   new Date().toISOString(),
    }).eq('id', id)
    if (error) return { success: false, error: error.message }

    await logHistory(id, 'edited', 'submitted', {
      visit_ref: visit.visit_ref,
      organisation: visit.organisation_name,
      interest: visit.interest_level,
      gps: gps ? 'attached' : 'none',
    })

    revalidatePath('/crm/field-visits')
    revalidatePath(`/crm/field-visits/${id}`)
    return { success: true, data: { visit_ref: visit.visit_ref } }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/** Soft delete. Same-day only (Asia/Dhaka), mirroring the coffee-shop rule. */
export async function voidFieldVisit(id: string, reason: string): Promise<ActionResult> {
  await requirePermission('field_visits', 'write')
  try {
    if (reason.trim().length < 2) return { success: false, error: 'A reason is required' }
    const db = dbc()
    const { data: visit } = await db.from('crm_field_visits')
      .select('status, visit_ref, submitted_at, created_at').eq('id', id).maybeSingle()
    if (!visit) return { success: false, error: 'Visit not found' }
    if (visit.status === 'void')      return { success: false, error: 'Already void' }
    if (visit.status === 'processed') return { success: false, error: 'Cannot void a processed visit — it is already in the CRM.' }

    // Window is measured from the day the visit was logged.
    const anchor = (visit.submitted_at ?? visit.created_at ?? '').slice(0, 10)
    if (anchor && !isStillSameDayInDhaka(anchor)) {
      return { success: false, error: 'Visits can only be voided on the day they were logged.' }
    }

    const { error } = await db.from('crm_field_visits')
      .update({ status: 'void', void_reason: reason.trim(), updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) return { success: false, error: error.message }

    await logHistory(id, 'edited', 'voided', { visit_ref: visit.visit_ref, reason })
    revalidatePath('/crm/field-visits')
    revalidatePath(`/crm/field-visits/${id}`)
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * Hand off to the CRM: link (or create) an account, set stage + tier, and
 * ONLY NOW write the crm_activities row. That insert is deferred to here
 * because crm_activities.account_id is NOT NULL — a cold visit has no
 * account until this moment. Keeping the insert here means the existing
 * `field_visits_done` KPI (which counts crm_activities) keeps working
 * without touching that table's schema.
 */
export async function processVisitToCrm(
  id: string,
  input: { accountId?: string | null; createNew?: boolean; stage: string; tier: 'a' | 'b' | 'c' },
): Promise<ActionData<{ accountId: string }>> {
  await requirePermission('field_visits', 'write')
  try {
    const db  = dbc()
    const ctx = await getCurrentUserContext()
    const visit = await getFieldVisitById(id)
    if (!visit) return { success: false, error: 'Visit not found' }
    if (visit.status === 'void')      return { success: false, error: 'This visit is void' }
    if (visit.status === 'processed') return { success: false, error: 'Already processed' }
    if (visit.status === 'draft')     return { success: false, error: 'Submit the visit before processing it' }

    let accountId = input.accountId ?? null

    // Create the account from the visit when the rep says it's new.
    if (!accountId && input.createNew) {
      if (!visit.organisation_name) return { success: false, error: 'Organisation name is required to create an account' }
      const { data: tier } = await db.from('crm_tiers').select('id').eq('slug', input.tier).maybeSingle()

      let created: { id: string } | null = null
      for (let attempt = 0; attempt < 5 && !created; attempt++) {
        const { count } = await db.from('crm_accounts').select('id', { count: 'exact', head: true })
        const { data, error } = await db.from('crm_accounts').insert({
          account_code:   formatAccountCode((count ?? 0) + attempt),
          company_name:   visit.organisation_name,
          sector_id:      visit.sector_id ?? null,
          tier_id:        tier?.id ?? null,
          hq_location:    visit.office_address ?? null,
          status:         'contacted',
          owner_user_id:  ctx?.user_id ?? null,
          last_engaged_at: visit.visit_date ? new Date(visit.visit_date).toISOString() : new Date().toISOString(),
          next_action:    visit.next_step?.join(', ') || null,
          notes:          `Created from field visit ${visit.visit_ref}`,
          created_by:     ctx?.user_id ?? null,
        }).select('id').single()
        if (!error) { created = data; break }
        if (error.code !== '23505') return { success: false, error: `Could not create account: ${error.message}` }
      }
      if (!created) return { success: false, error: 'Could not generate a unique account code' }
      accountId = created.id

      // Carry the visit's named contacts across into the CRM rolodex.
      const named = visit.contacts.filter((c) => (c.name ?? '').trim())
      if (named.length) {
        await db.from('crm_contacts').insert(named.map((c, i) => ({
          account_id:  accountId,
          full_name:   c.name,
          designation: c.designation ?? null,
          email:       c.email ?? null,
          phone:       c.mobile ?? null,
          is_primary:  c.is_decision_maker || i === 0,
          notes:       `From field visit ${visit.visit_ref}`,
        })))
      }
    }

    if (!accountId) return { success: false, error: 'Pick an account to link, or choose "create new"' }

    // Deferred crm_activities insert — keeps the existing KPI intact.
    let activityId: string | null = null
    try {
      const { data: act } = await db.from('crm_activities').insert({
        account_id:    accountId,
        activity_type: 'field_visit',
        activity_date: visit.visit_date ?? new Date().toISOString().slice(0, 10),
        subject:       `Field visit ${visit.visit_ref} — ${visit.organisation_name ?? 'unknown org'}`,
        notes:         [
          visit.interest_level ? `Interest: ${visit.interest_level}` : null,
          visit.event_types?.length ? `Events: ${visit.event_types.join(', ')}` : null,
          visit.annual_event_spend ? `Annual spend: ${visit.annual_event_spend}` : null,
        ].filter(Boolean).join(' · ') || null,
        outcome:        visit.interest_level === 'hot' ? 'positive'
                      : visit.interest_level === 'cold' ? 'negative' : 'neutral',
        next_step:      visit.next_step?.join(', ') || null,
        next_step_date: visit.due_by ?? null,
        logged_by:      ctx?.user_id ?? null,
      }).select('id').single()
      activityId = act?.id ?? null
    } catch (err) {
      // Non-fatal: the visit is still processed. Surfaced in history.
      console.warn('[field-visits] crm_activities insert non-fatal:', err)
    }

    const { error } = await db.from('crm_field_visits').update({
      account_id:      accountId,
      pipeline_stage:  input.stage,
      discount_tier:   input.tier,
      crm_activity_id: activityId,
      processed_at:    new Date().toISOString(),
      status:          'processed',
      updated_at:      new Date().toISOString(),
    }).eq('id', id)
    if (error) return { success: false, error: error.message }

    await logHistory(id, 'edited', 'processed_to_crm', {
      visit_ref: visit.visit_ref, account_id: accountId,
      stage: input.stage, tier: input.tier,
      crm_activity_created: !!activityId,
    })

    revalidatePath('/crm/field-visits')
    revalidatePath(`/crm/field-visits/${id}`)
    revalidatePath('/crm/accounts')
    return { success: true, data: { accountId } }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}
