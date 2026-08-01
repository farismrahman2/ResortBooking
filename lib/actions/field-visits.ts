'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission, getCurrentUserContext, isAdmin } from '@/lib/auth/permissions'
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


/**
 * Has the rep actually entered anything worth persisting?
 *
 * Guards the lazy-create in saveDraftVisit so that merely opening the wizard
 * — or opening it and tapping Next a few times — never writes a row. Only
 * fields a human must deliberately fill count: the wizard pre-seeds one empty
 * contact card, so an untouched contact array is not "content".
 */
function hasMeaningfulContent(input: Record<string, unknown>): boolean {
  const text = [
    'organisation_name', 'office_address', 'territory_zone', 'visit_type',
    'sector_id', 'employee_band', 'best_time_to_call', 'events_per_year',
    'typical_headcount', 'budget_per_head_band', 'interest_level',
    'next_event_month', 'next_event_type', 'visit_date', 'sales_executive_id',
    'due_by', 'follow_up_owner_id',
  ]
  for (const k of text) {
    const v = input[k]
    if (typeof v === 'string' && v.trim()) return true
  }
  const nums = ['rooms_needed', 'annual_event_spend', 'next_event_pax']
  for (const k of nums) if (typeof input[k] === 'number') return true

  const arrays = [
    'decision_signoff', 'preferred_channel', 'event_types', 'event_format',
    'preferred_day', 'peak_months', 'transport', 'materials_given', 'next_step',
  ]
  for (const k of arrays) {
    const v = input[k]
    if (Array.isArray(v) && v.length > 0) return true
  }

  // A contact only counts once it has a real field filled in.
  const contacts = input.contacts
  if (Array.isArray(contacts) && contacts.some((c) =>
    ['name', 'designation', 'department', 'mobile', 'email']
      .some((f) => typeof (c as Record<string, unknown>)?.[f] === 'string'
        && ((c as Record<string, string>)[f] ?? '').trim())
  )) return true

  const venues = input.venues
  if (Array.isArray(venues) && venues.length > 0) return true

  return false
}

/**
 * Creates an empty draft so the wizard has an id to autosave against.
 * `prefill.organisationName` supports the "log another visit at this
 * organisation" shortcut on the confirmation screen.
 */
export async function createDraftVisit(
  prefill?: { organisationName?: string | null },
): Promise<ActionData<{ id: string; visit_ref: string }>> {
  await requirePermission('field_visits', 'write')
  try {
    const db  = dbc()
    const ctx = await getCurrentUserContext()
    const org = prefill?.organisationName?.trim() || null

    // Retry on UNIQUE collision — mirrors the account-code pattern.
    let created: { id: string; visit_ref: string } | null = null
    for (let attempt = 0; attempt < 5 && !created; attempt++) {
      const { count } = await db.from('crm_field_visits').select('id', { count: 'exact', head: true })
      const ref = formatVisitRef((count ?? 0) + attempt)
      const { data, error } = await db.from('crm_field_visits')
        .insert({
          visit_ref: ref, status: 'draft',
          organisation_name: org,
          created_by: ctx?.user_id ?? null,
        })
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
      .select('status, visit_ref').eq('id', id).maybeSingle()

    const { contacts, venues, ...visitFields } = input

    // No row yet — this is a brand-new visit whose id was minted client-side.
    // Create it lazily, and ONLY if the rep has actually entered something.
    // Opening the form to look at it must not leave a row behind.
    if (!existing) {
      if (!hasMeaningfulContent(input)) return { success: true }   // nothing to save yet
      const ctx = await getCurrentUserContext()
      let created = false
      for (let attempt = 0; attempt < 6 && !created; attempt++) {
        const { count } = await db.from('crm_field_visits').select('id', { count: 'exact', head: true })
        const { error } = await db.from('crm_field_visits').insert({
          id,
          visit_ref:  formatVisitRef((count ?? 0) + attempt),
          status:     'draft',
          created_by: ctx?.user_id ?? null,
        })
        if (!error) { created = true; break }
        if (error.code !== '23505') return { success: false, error: error.message }
      }
      if (!created) return { success: false, error: 'Could not allocate a visit reference' }
    } else {
      // Drafts edit freely. A SUBMITTED visit stays amendable so a rep can fix
      // a typo they spot afterwards — it hasn't reached the CRM yet. Once
      // processed (or voided) the record is frozen.
      if (existing.status !== 'draft' && existing.status !== 'submitted') {
        return { success: false, error: `Cannot edit — this visit is ${existing.status}.` }
      }
    }
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

    // Post-submission corrections are worth an audit entry; draft autosaves
    // fire constantly and would just be noise.
    if (existing.status === 'submitted') {
      await logHistory(id, 'edited', 'amended_after_submit', { visit_ref: existing.visit_ref })
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

/**
 * Soft delete. Same-day only (Asia/Dhaka) for ordinary users, mirroring the
 * coffee-shop rule — a rep can undo their own mistake on the day, but can't
 * quietly rewrite last week's activity.
 *
 * An admin has no such window, and can also void an already-processed visit
 * (the CRM account and activity it created are left untouched — those are
 * separate records with their own lifecycle).
 */
export async function voidFieldVisit(id: string, reason: string): Promise<ActionResult> {
  await requirePermission('field_visits', 'write')
  try {
    if (reason.trim().length < 2) return { success: false, error: 'A reason is required' }
    const db    = dbc()
    const admin = await isAdmin()
    const { data: visit } = await db.from('crm_field_visits')
      .select('status, visit_ref, submitted_at, created_at').eq('id', id).maybeSingle()
    if (!visit) return { success: false, error: 'Visit not found' }
    if (visit.status === 'void') return { success: false, error: 'Already void' }
    if (visit.status === 'processed' && !admin) {
      return { success: false, error: 'This visit is already in the CRM — only an admin can void it.' }
    }

    // Window is measured from the day the visit was logged. Admins bypass it.
    if (!admin) {
      const anchor = (visit.submitted_at ?? visit.created_at ?? '').slice(0, 10)
      if (anchor && !isStillSameDayInDhaka(anchor)) {
        return {
          success: false,
          error: 'Visits can only be voided on the day they were logged. Ask an admin to void an older visit.',
        }
      }
    }

    const { error } = await db.from('crm_field_visits')
      .update({ status: 'void', void_reason: reason.trim(), updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) return { success: false, error: error.message }

    await logHistory(id, 'edited', 'voided', {
      visit_ref: visit.visit_ref, reason,
      was_status: visit.status, by_admin: admin,
    })
    revalidatePath('/crm/field-visits')
    revalidatePath(`/crm/field-visits/${id}`)
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * Permanent delete — admin only, type-to-confirm on the visit ref.
 * Destroys the visit, its contacts, venues and card photos.
 *
 * Anything the visit pushed into the CRM (the account, and the
 * crm_activities row created at process time) is deliberately LEFT ALONE.
 * Those are the sales team's records now with their own lifecycle, and the
 * KPI actuals are computed from crm_activities — silently deleting them here
 * would rewrite someone's historical numbers.
 */
export async function hardDeleteFieldVisit(
  id: string,
  confirmRef: string,
): Promise<ActionData<{ visit_ref: string }>> {
  await requirePermission('field_visits', 'write')
  try {
    // Defence in depth: permission gate above + explicit role check here.
    const ctx = await getCurrentUserContext()
    if (!ctx || ctx.profile.role.slug !== 'admin') {
      return { success: false, error: 'Only an Admin can permanently delete a visit.' }
    }
    const db = dbc()

    const { data: visit } = await db.from('crm_field_visits')
      .select('visit_ref, organisation_name, status, account_id').eq('id', id).maybeSingle()
    if (!visit) return { success: false, error: 'Visit not found' }
    if (confirmRef.trim().toUpperCase() !== visit.visit_ref.trim().toUpperCase()) {
      return { success: false, error: `Type ${visit.visit_ref} exactly to confirm.` }
    }

    // Remove the card images before the rows cascade away, otherwise the
    // storage paths are gone and the objects are orphaned forever.
    try {
      const { data: cards } = await db.from('crm_field_visit_cards')
        .select('storage_path').eq('visit_id', id)
      const paths = (cards ?? []).map((c: { storage_path: string }) => c.storage_path)
      if (paths.length) await db.storage.from('field-visit-cards').remove(paths)
    } catch (err) {
      console.warn('[field-visits] card cleanup on delete non-fatal:', err)
    }

    // Children (contacts, venues, cards) cascade on the FK.
    const { error } = await db.from('crm_field_visits').delete().eq('id', id)
    if (error) return { success: false, error: error.message }

    await logHistory(id, 'edited', 'hard_deleted', {
      visit_ref: visit.visit_ref,
      organisation: visit.organisation_name,
      was_status: visit.status,
      crm_account_kept: visit.account_id ?? null,
      by: ctx.email ?? null,
    })

    revalidatePath('/crm/field-visits')
    return { success: true, data: { visit_ref: visit.visit_ref } }
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

/**
 * Record a visiting-card photo after the client has uploaded it to storage.
 * Also ticks OUT.02 "visiting_card" — if a card was collected, that box is
 * true by definition, and making the rep tick it separately is redundant.
 */
export async function attachVisitCard(input: {
  visit_id:      string
  storage_path:  string
  file_name:     string
  mime_type:     string
  size_bytes:    number
  contact_label?: string | null
}): Promise<ActionResult> {
  await requirePermission('field_visits', 'write')
  try {
    const db  = dbc()
    const ctx = await getCurrentUserContext()

    const { data: visit } = await db.from('crm_field_visits')
      .select('status, materials_given').eq('id', input.visit_id).maybeSingle()
    if (!visit) return { success: false, error: 'Visit not found' }
    if (visit.status === 'processed' || visit.status === 'void') {
      return { success: false, error: `Cannot attach — this visit is ${visit.status}.` }
    }

    const { error } = await db.from('crm_field_visit_cards').insert({
      visit_id:      input.visit_id,
      storage_path:  input.storage_path,
      file_name:     input.file_name,
      mime_type:     input.mime_type,
      size_bytes:    input.size_bytes,
      contact_label: input.contact_label ?? null,
      created_by:    ctx?.user_id ?? null,
    })
    if (error) return { success: false, error: error.message }

    const materials: string[] = visit.materials_given ?? []
    if (!materials.includes('visiting_card')) {
      await db.from('crm_field_visits').update({
        // 'nothing' is mutually exclusive with the rest (OUT.02).
        materials_given: [...materials.filter((m) => m !== 'nothing'), 'visiting_card'],
      }).eq('id', input.visit_id)
    }

    revalidatePath(`/crm/field-visits/${input.visit_id}`)
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/** Soft-delete the row, then best-effort remove the object from storage. */
export async function removeVisitCard(cardId: string): Promise<ActionResult> {
  await requirePermission('field_visits', 'write')
  try {
    const db = dbc()
    const { data: card } = await db.from('crm_field_visit_cards')
      .select('storage_path, visit_id').eq('id', cardId).maybeSingle()
    if (!card) return { success: false, error: 'Card not found' }

    const { error } = await db.from('crm_field_visit_cards').delete().eq('id', cardId)
    if (error) return { success: false, error: error.message }

    try {
      await dbc().storage.from('field-visit-cards').remove([card.storage_path])
    } catch (err) {
      // Orphaned object is harmless; the metadata row is the source of truth.
      console.warn('[field-visits] card storage cleanup non-fatal:', err)
    }

    revalidatePath(`/crm/field-visits/${card.visit_id}`)
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * Sync a visit captured offline.
 *
 * The client generates the row id (a UUID) so the wizard can work with no
 * network at all. What it CANNOT generate is `visit_ref` — GCR-FV-NNNNN is a
 * sequential counter, and two reps offline would both believe they were
 * next. So the real reference is minted here, at sync time, and the device
 * only ever holds a temporary local label.
 *
 * Idempotent: re-syncing the same localId updates the existing row rather
 * than creating a duplicate, so a retry after a half-failed upload is safe.
 */
export async function syncOfflineVisit(input: {
  localId:   string
  payload:   unknown
  submitted: boolean
  gps:       { lat: number; lng: number } | null
}): Promise<ActionData<{ id: string; visit_ref: string; alreadyExisted: boolean }>> {
  await requirePermission('field_visits', 'write')
  try {
    const db  = dbc()
    const ctx = await getCurrentUserContext()
    const parsed = fieldVisitDraftSchema.parse(input.payload ?? {})
    const { contacts, venues, ...visitFields } = parsed

    if (visitFields.materials_given) {
      visitFields.materials_given = normaliseMaterials(visitFields.materials_given)
    }

    // Already synced? Update in place — this is the retry path.
    const { data: existing } = await db.from('crm_field_visits')
      .select('id, visit_ref, status').eq('id', input.localId).maybeSingle()

    let visitRef: string = existing?.visit_ref ?? ''
    if (!existing) {
      let inserted = false
      for (let attempt = 0; attempt < 6 && !inserted; attempt++) {
        const { count } = await db.from('crm_field_visits').select('id', { count: 'exact', head: true })
        const ref = formatVisitRef((count ?? 0) + attempt)
        const { error } = await db.from('crm_field_visits').insert({
          id:         input.localId,          // client-generated
          visit_ref:  ref,
          status:     'draft',
          created_by: ctx?.user_id ?? null,
          ...visitFields,
        })
        if (!error) { visitRef = ref; inserted = true; break }
        // 23505 on visit_ref → another device took that number, try the next.
        if (error.code !== '23505') return { success: false, error: error.message }
      }
      if (!inserted) return { success: false, error: 'Could not allocate a visit reference' }
    } else {
      if (existing.status === 'processed' || existing.status === 'void') {
        // Someone already actioned it server-side; don't clobber that.
        return { success: true, data: { id: existing.id, visit_ref: existing.visit_ref, alreadyExisted: true } }
      }
      const { error } = await db.from('crm_field_visits')
        .update({ ...visitFields, updated_at: new Date().toISOString() })
        .eq('id', input.localId)
      if (error) return { success: false, error: error.message }
    }

    // Children are replace-all, matching saveDraftVisit's semantics.
    if (contacts) {
      await db.from('crm_field_visit_contacts').delete().eq('visit_id', input.localId)
      const rows = contacts
        .filter((c) => c.name || c.designation || c.mobile || c.email)
        .map((c, i) => ({
          visit_id: input.localId, sort_order: i,
          name: c.name ?? null, designation: c.designation ?? null,
          department: c.department ?? null, mobile: c.mobile ?? null,
          email: c.email ?? null, is_decision_maker: c.is_decision_maker ?? false,
        }))
      if (rows.length) await db.from('crm_field_visit_contacts').insert(rows)
    }
    if (venues) {
      await db.from('crm_field_visit_venues').delete().eq('visit_id', input.localId)
      const rows = venues
        .filter((v) => v.venue_name || v.pax || v.rate_per_head || v.feedback)
        .map((v, i) => ({
          visit_id: input.localId, sort_order: i,
          venue_name: v.venue_name ?? null, event_month_year: v.event_month_year ?? null,
          pax: v.pax ?? null, rate_per_head: v.rate_per_head ?? null,
          feedback: v.feedback ?? null,
        }))
      if (rows.length) await db.from('crm_field_visit_venues').insert(rows)
    }

    // Only now run the submit gate, so a queued-but-incomplete visit lands as
    // a draft on the server rather than being rejected and lost.
    if (input.submitted) {
      const full = await getFieldVisitById(input.localId)
      const check = fieldVisitSubmitSchema.safeParse({ ...full, contacts: full?.contacts ?? [] })
      if (check.success) {
        await db.from('crm_field_visits').update({
          status: 'submitted',
          submitted_at: new Date().toISOString(),
          gps_lat: input.gps?.lat ?? null,
          gps_lng: input.gps?.lng ?? null,
        }).eq('id', input.localId)
      }
    }

    await logHistory(input.localId, 'created', 'synced_from_offline', {
      visit_ref: visitRef, submitted: input.submitted,
    })

    revalidatePath('/crm/field-visits')
    return { success: true, data: { id: input.localId, visit_ref: visitRef, alreadyExisted: !!existing } }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * Discard a draft outright. Drafts have never reached the CRM and, unlike a
 * submitted visit, carry no audit value — so this is a real delete, available
 * to whoever owns the draft rather than admin-only.
 *
 * Refuses anything past `draft`; those go through void/hardDelete instead.
 */
export async function discardDraftVisit(id: string): Promise<ActionResult> {
  await requirePermission('field_visits', 'write')
  try {
    const db = dbc()
    const { data: visit } = await db.from('crm_field_visits')
      .select('status, visit_ref').eq('id', id).maybeSingle()
    // Nothing there — the row was never created (the lazy-create path). That's
    // a success from the caller's point of view.
    if (!visit) return { success: true }
    if (visit.status !== 'draft') {
      return { success: false, error: 'Only drafts can be discarded. Void or delete this visit instead.' }
    }

    try {
      const { data: cards } = await db.from('crm_field_visit_cards')
        .select('storage_path').eq('visit_id', id)
      const paths = (cards ?? []).map((c: { storage_path: string }) => c.storage_path)
      if (paths.length) await db.storage.from('field-visit-cards').remove(paths)
    } catch (err) {
      console.warn('[field-visits] card cleanup on discard non-fatal:', err)
    }

    const { error } = await db.from('crm_field_visits').delete().eq('id', id)
    if (error) return { success: false, error: error.message }

    revalidatePath('/crm/field-visits')
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}
