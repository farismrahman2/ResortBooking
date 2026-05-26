'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission, getCurrentUserContext } from '@/lib/auth/permissions'
import { accountFormSchema, contactFormSchema, type AccountFormInput, type ContactFormInput } from '@/lib/validators/crm'
import { formatAccountCode } from '@/lib/crm/account-code'
import type { ActionResult, ActionData } from './types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const dbc = () => createClient() as any

async function currentUserId(): Promise<string | null> {
  const { data } = await createClient().auth.getUser()
  return data.user?.id ?? null
}

type CrmEntity = 'crm_account' | 'crm_contact' | 'crm_opportunity' | 'crm_activity'

async function logHistory(entity: CrmEntity, id: string, event: 'created' | 'edited', payload: Record<string, unknown> = {}) {
  try {
    const { error } = await dbc().from('history_log').insert({
      entity_type: entity, entity_id: id, event, actor: 'system', payload,
    })
    if (error) console.warn(`[history_log] non-fatal: ${error.message}`)
  } catch (err) {
    console.warn('[history_log] non-fatal:', err)
  }
}

/** Would setting `account.parent = proposedParent` create a cycle? */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function wouldCreateCycle(db: any, accountId: string, proposedParentId: string): Promise<boolean> {
  if (accountId === proposedParentId) return true
  let cursor: string | null = proposedParentId
  const seen = new Set<string>()
  while (cursor) {
    if (cursor === accountId) return true
    if (seen.has(cursor)) break
    seen.add(cursor)
    const res: { data: { parent_account_id: string | null } | null } =
      await db.from('crm_accounts').select('parent_account_id').eq('id', cursor).maybeSingle()
    cursor = res.data?.parent_account_id ?? null
  }
  return false
}

// ─── Accounts ──────────────────────────────────────────────────────────────────

export async function createAccount(raw: AccountFormInput): Promise<ActionData<{ id: string; account_code: string }>> {
  await requirePermission('crm', 'write')
  try {
    const input = accountFormSchema.parse(raw)
    const db = dbc()
    const userId = await currentUserId()

    if (input.parent_account_id) {
      // New account has no id yet, so a cycle is impossible; just confirm parent exists.
      const { data: parent } = await db.from('crm_accounts').select('id').eq('id', input.parent_account_id).maybeSingle()
      if (!parent) return { success: false, error: 'Parent account not found' }
    }

    let created: { id: string; account_code: string } | null = null
    for (let attempt = 0; attempt < 5 && !created; attempt++) {
      let code = input.account_code?.trim()
      if (!code) {
        const { count } = await db.from('crm_accounts').select('id', { count: 'exact', head: true })
        code = formatAccountCode((count ?? 0) + attempt)
      }
      const { data, error } = await db.from('crm_accounts').insert({
        account_code:      code,
        parent_account_id: input.parent_account_id ?? null,
        company_name:      input.company_name,
        sector_id:         input.sector_id ?? null,
        tier_id:           input.tier_id ?? null,
        hq_location:       input.hq_location ?? null,
        branch_presence:   input.branch_presence ?? null,
        approx_employees:  input.approx_employees ?? null,
        status:            input.status,
        owner_user_id:     input.owner_user_id,
        next_action:       input.next_action ?? null,
        notes:             input.notes ?? null,
        last_engaged_at:   new Date().toISOString(),
        created_by:        userId,
      }).select('id, account_code').single()
      if (!error) { created = data; break }
      if (error.code !== '23505' || input.account_code) return { success: false, error: error.message }
    }
    if (!created) return { success: false, error: 'Could not generate a unique account code' }

    await logHistory('crm_account', created.id, 'created', { account_code: created.account_code, company_name: input.company_name })
    revalidatePath('/crm')
    revalidatePath('/crm/accounts')
    return { success: true, data: created }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function updateAccount(id: string, raw: AccountFormInput): Promise<ActionResult> {
  await requirePermission('crm', 'write')
  try {
    const input = accountFormSchema.parse(raw)
    const db = dbc()

    if (input.parent_account_id) {
      if (await wouldCreateCycle(db, id, input.parent_account_id)) {
        return { success: false, error: 'That parent would create a circular hierarchy' }
      }
    }

    const update: Record<string, unknown> = {
      company_name:      input.company_name,
      parent_account_id: input.parent_account_id ?? null,
      sector_id:         input.sector_id ?? null,
      tier_id:           input.tier_id ?? null,
      hq_location:       input.hq_location ?? null,
      branch_presence:   input.branch_presence ?? null,
      approx_employees:  input.approx_employees ?? null,
      status:            input.status,
      owner_user_id:     input.owner_user_id,
      next_action:       input.next_action ?? null,
      notes:             input.notes ?? null,
      updated_at:        new Date().toISOString(),
    }
    if (input.account_code?.trim()) update.account_code = input.account_code.trim()

    const { error } = await db.from('crm_accounts').update(update).eq('id', id)
    if (error) return { success: false, error: error.message }

    await logHistory('crm_account', id, 'edited', { company_name: input.company_name, status: input.status })
    revalidatePath('/crm/accounts')
    revalidatePath(`/crm/accounts/${id}`)
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function deactivateAccount(id: string): Promise<ActionResult> {
  await requirePermission('crm', 'write')
  try {
    const db = dbc()
    const now = new Date().toISOString()
    await db.from('crm_accounts').update({ is_active: false, updated_at: now }).eq('id', id)
    await db.from('crm_contacts').update({ is_active: false, updated_at: now }).eq('account_id', id)
    await logHistory('crm_account', id, 'edited', { action: 'deactivated' })
    revalidatePath('/crm/accounts')
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function reassignAccount(id: string, newOwnerId: string): Promise<ActionResult> {
  await requirePermission('crm', 'write')
  try {
    const ctx = await getCurrentUserContext()
    if (ctx?.profile.role.slug !== 'admin') return { success: false, error: 'Only an admin can reassign accounts' }
    const db = dbc()
    const { data: prev } = await db.from('crm_accounts').select('owner_user_id').eq('id', id).maybeSingle()
    const { error } = await db.from('crm_accounts').update({ owner_user_id: newOwnerId, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) return { success: false, error: error.message }
    await logHistory('crm_account', id, 'edited', { action: 'reassigned', from: prev?.owner_user_id ?? null, to: newOwnerId })
    revalidatePath('/crm/accounts')
    revalidatePath(`/crm/accounts/${id}`)
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

// ─── Contacts ──────────────────────────────────────────────────────────────────

async function demoteOtherPrimaries(db: ReturnType<typeof dbc>, accountId: string, exceptId?: string) {
  let q = db.from('crm_contacts').update({ is_primary: false, updated_at: new Date().toISOString() })
    .eq('account_id', accountId).eq('is_primary', true)
  if (exceptId) q = q.neq('id', exceptId)
  await q
}

export async function createContact(raw: ContactFormInput): Promise<ActionData<{ id: string }>> {
  await requirePermission('crm', 'write')
  try {
    const input = contactFormSchema.parse(raw)
    const db = dbc()

    if (input.is_primary) await demoteOtherPrimaries(db, input.account_id)

    const { data, error } = await db.from('crm_contacts').insert({
      account_id:      input.account_id,
      full_name:       input.full_name,
      designation:     input.designation ?? null,
      department:      input.department ?? null,
      email:           input.email ?? null,
      phone:           input.phone ?? null,
      whatsapp:        input.whatsapp ?? null,
      office_location: input.office_location ?? null,
      is_primary:      input.is_primary,
      linkedin_url:    input.linkedin_url ?? null,
      notes:           input.notes ?? null,
    }).select('id').single()
    if (error) return { success: false, error: error.message }

    await logHistory('crm_contact', data.id, 'created', { account_id: input.account_id, full_name: input.full_name })
    revalidatePath(`/crm/accounts/${input.account_id}`)
    return { success: true, data: { id: data.id } }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function updateContact(id: string, raw: ContactFormInput): Promise<ActionResult> {
  await requirePermission('crm', 'write')
  try {
    const input = contactFormSchema.parse(raw)
    const db = dbc()
    if (input.is_primary) await demoteOtherPrimaries(db, input.account_id, id)

    const { error } = await db.from('crm_contacts').update({
      full_name:       input.full_name,
      designation:     input.designation ?? null,
      department:      input.department ?? null,
      email:           input.email ?? null,
      phone:           input.phone ?? null,
      whatsapp:        input.whatsapp ?? null,
      office_location: input.office_location ?? null,
      is_primary:      input.is_primary,
      linkedin_url:    input.linkedin_url ?? null,
      notes:           input.notes ?? null,
      updated_at:      new Date().toISOString(),
    }).eq('id', id)
    if (error) return { success: false, error: error.message }

    await logHistory('crm_contact', id, 'edited', { full_name: input.full_name })
    revalidatePath(`/crm/accounts/${input.account_id}`)
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function setPrimaryContact(contactId: string): Promise<ActionResult> {
  await requirePermission('crm', 'write')
  try {
    const db = dbc()
    const { data: c } = await db.from('crm_contacts').select('account_id').eq('id', contactId).maybeSingle()
    if (!c) return { success: false, error: 'Contact not found' }
    await demoteOtherPrimaries(db, c.account_id, contactId)
    const { error } = await db.from('crm_contacts').update({ is_primary: true, updated_at: new Date().toISOString() }).eq('id', contactId)
    if (error) return { success: false, error: error.message }
    revalidatePath(`/crm/accounts/${c.account_id}`)
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function deactivateContact(id: string): Promise<ActionResult> {
  await requirePermission('crm', 'write')
  try {
    const db = dbc()
    const { data: c } = await db.from('crm_contacts').select('account_id').eq('id', id).maybeSingle()
    const { error } = await db.from('crm_contacts').update({ is_active: false, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) return { success: false, error: error.message }
    await logHistory('crm_contact', id, 'edited', { action: 'deactivated' })
    if (c?.account_id) revalidatePath(`/crm/accounts/${c.account_id}`)
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

// ─── Settings: tiers + sales_start_date ────────────────────────────────────────

export async function updateTier(
  id: string,
  input: { default_discount_pct: number; description: string | null },
): Promise<ActionResult> {
  await requirePermission('settings', 'write')
  try {
    if (input.default_discount_pct < 0 || input.default_discount_pct > 100) {
      return { success: false, error: 'Discount must be between 0 and 100' }
    }
    const { error } = await dbc().from('crm_tiers')
      .update({ default_discount_pct: input.default_discount_pct, description: input.description }).eq('id', id)
    if (error) return { success: false, error: error.message }
    revalidatePath('/settings/crm-tiers')
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function setSalesStartDate(userId: string, date: string | null): Promise<ActionResult> {
  await requirePermission('settings', 'write')
  try {
    const { error } = await dbc().from('user_profiles')
      .update({ sales_start_date: date, updated_at: new Date().toISOString() }).eq('user_id', userId)
    if (error) return { success: false, error: error.message }
    revalidatePath(`/settings/users/${userId}`)
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}
