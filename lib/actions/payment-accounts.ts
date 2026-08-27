'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/permissions'
import { isMissingRelation } from '@/lib/supabase/errors'
import type { ActionResult, ActionData } from './types'

const METHODS = ['cash', 'bkash', 'nagad', 'rocket', 'card', 'bank_transfer', 'other']

interface AccountInput {
  display_name: string
  method:       string
  account_ref?: string | null
  bank_name?:   string | null
  notes?:       string | null
}

function validate(input: AccountInput): string | null {
  if (!input.display_name?.trim()) return 'Give the account a name'
  if (input.display_name.trim().length > 80) return 'Name is too long'
  if (!METHODS.includes(input.method)) return 'Pick which tender lands here'
  return null
}

const MIGRATION_HINT =
  'Run migrations/platform-audit/004_payment_accounts.sql first — the payment accounts table does not exist yet.'

export async function createPaymentAccount(input: AccountInput): Promise<ActionData<{ id: string }>> {
  await requirePermission('settings', 'write')
  try {
    const invalid = validate(input)
    if (invalid) return { success: false, error: invalid }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = createClient() as any
    const { data, error } = await db.from('payment_accounts').insert({
      display_name: input.display_name.trim(),
      method:       input.method,
      account_ref:  input.account_ref?.trim() || null,
      bank_name:    input.bank_name?.trim() || null,
      notes:        input.notes?.trim() || null,
    }).select('id').single()
    if (error) return { success: false, error: isMissingRelation(error) ? MIGRATION_HINT : error.message }
    revalidatePath('/settings/payment-accounts')
    return { success: true, data: { id: data.id } }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function updatePaymentAccount(id: string, input: AccountInput): Promise<ActionResult> {
  await requirePermission('settings', 'write')
  try {
    const invalid = validate(input)
    if (invalid) return { success: false, error: invalid }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = createClient() as any
    const { error } = await db.from('payment_accounts').update({
      display_name: input.display_name.trim(),
      method:       input.method,
      account_ref:  input.account_ref?.trim() || null,
      bank_name:    input.bank_name?.trim() || null,
      notes:        input.notes?.trim() || null,
    }).eq('id', id)
    if (error) return { success: false, error: isMissingRelation(error) ? MIGRATION_HINT : error.message }
    revalidatePath('/settings/payment-accounts')
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * Retire an account rather than delete it — payments already point at it and
 * history must keep naming where that money went.
 */
export async function togglePaymentAccountActive(id: string): Promise<ActionResult> {
  await requirePermission('settings', 'write')
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = createClient() as any
    const { data: cur } = await db.from('payment_accounts').select('is_active').eq('id', id).maybeSingle()
    if (!cur) return { success: false, error: 'Account not found' }
    const { error } = await db.from('payment_accounts')
      .update({ is_active: !cur.is_active }).eq('id', id)
    if (error) return { success: false, error: error.message }
    revalidatePath('/settings/payment-accounts')
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * Mark where advances of this tender always land — bank transfer → EBL. One
 * default per tender (a partial unique index enforces it), so setting a new
 * one clears the old first rather than failing on the constraint.
 */
export async function setAdvanceDefaultAccount(id: string): Promise<ActionResult> {
  await requirePermission('settings', 'write')
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = createClient() as any
    const { data: cur } = await db.from('payment_accounts')
      .select('method, is_advance_default').eq('id', id).maybeSingle()
    if (!cur) return { success: false, error: 'Account not found' }

    // Toggling the current default off just clears it — no tender is forced to
    // have one; without it the agent is asked instead.
    const turningOn = !cur.is_advance_default
    const { error: clearErr } = await db.from('payment_accounts')
      .update({ is_advance_default: false })
      .eq('method', cur.method).eq('is_advance_default', true)
    if (clearErr) {
      return { success: false, error: isMissingRelation(clearErr) ? MIGRATION_HINT : clearErr.message }
    }
    if (turningOn) {
      const { error } = await db.from('payment_accounts')
        .update({ is_advance_default: true }).eq('id', id)
      if (error) return { success: false, error: error.message }
    }
    revalidatePath('/settings/payment-accounts')
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}
