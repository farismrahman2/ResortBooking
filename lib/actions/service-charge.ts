'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { serviceChargeFormSchema } from '@/lib/validators/hr'
import type { ActionResult, ActionData } from './types'
import { requirePermission } from '@/lib/auth/permissions'

async function logHistory(
  entityId: string,
  event: 'created' | 'edited',
  action: string,
  payload: Record<string, unknown> = {},
) {
  try {
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any
    const { error } = await db.from('history_log').insert({
      entity_type: 'employee',
      entity_id:   entityId,
      event,
      actor:       'system',
      payload:     { action, ...payload },
    })
    if (error) console.warn(`[history_log] non-fatal: ${error.message}`)
  } catch (err) {
    console.warn(`[history_log] non-fatal:`, err)
  }
}

async function currentUserId(): Promise<string | null> {
  const supabase = createClient()
  const { data } = await supabase.auth.getUser()
  return data.user?.id ?? null
}

/**
 * A finalized payroll month is paid money. Service charge feeds straight into
 * net pay, so once the month's run is finalized these rows must be read-only —
 * editing them changed the book without changing what anyone was paid.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function monthIsFinalized(db: any, monthIso: string): Promise<boolean> {
  const { data } = await db
    .from('payroll_runs')
    .select('id')
    .eq('period', monthIso)
    .eq('status', 'finalized')
    .maybeSingle()
  return Boolean(data)
}

/**
 * UPSERT semantics — there's a UNIQUE index on (employee_id, applies_to_month).
 * Re-saving overwrites the previous amount.
 */
export async function upsertServiceCharge(
  input: unknown,
): Promise<ActionData<{ id: string }>> {
  await requirePermission('hr', 'write')
  try {
    const parsed = serviceChargeFormSchema.parse(input)
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any
    const userId = await currentUserId()

    if (await monthIsFinalized(db, parsed.applies_to_month)) {
      return { success: false, error: 'Payroll for this month is finalized — service charge can no longer be changed.' }
    }

    const { data: existing } = await db
      .from('service_charge_payouts')
      .select('id')
      .eq('employee_id', parsed.employee_id)
      .eq('applies_to_month', parsed.applies_to_month)
      .maybeSingle()

    if (existing) {
      const { error } = await db
        .from('service_charge_payouts')
        .update({
          amount: parsed.amount,
          notes:  parsed.notes || null,
        })
        .eq('id', existing.id)
      if (error) return { success: false, error: error.message }
      await logHistory(parsed.employee_id, 'edited', 'service_charge_updated', {
        month: parsed.applies_to_month, amount: parsed.amount,
      })
      revalidatePath('/hr/service-charge')
      revalidatePath('/hr/payroll')
      return { success: true, data: { id: existing.id } }
    }

    const { data, error } = await db
      .from('service_charge_payouts')
      .insert({
        employee_id:      parsed.employee_id,
        applies_to_month: parsed.applies_to_month,
        amount:           parsed.amount,
        notes:            parsed.notes || null,
        created_by:       userId,
      })
      .select('id')
      .single()
    if (error || !data) return { success: false, error: error?.message ?? 'Insert failed' }

    await logHistory(parsed.employee_id, 'created', 'service_charge_created', {
      month: parsed.applies_to_month, amount: parsed.amount,
    })

    revalidatePath('/hr/service-charge')
    revalidatePath('/hr/payroll')
    return { success: true, data: { id: data.id } }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function deleteServiceCharge(id: string): Promise<ActionResult> {
  await requirePermission('hr', 'write')
  try {
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any
    const { data: row } = await db
      .from('service_charge_payouts')
      .select('id, employee_id, applies_to_month')
      .eq('id', id)
      .single()
    if (!row) return { success: false, error: 'Not found' }
    if (await monthIsFinalized(db, row.applies_to_month)) {
      return { success: false, error: 'Payroll for this month is finalized — service charge can no longer be deleted.' }
    }
    const { error } = await db.from('service_charge_payouts').delete().eq('id', id)
    if (error) return { success: false, error: error.message }
    await logHistory(row.employee_id, 'edited', 'service_charge_deleted', {})
    revalidatePath('/hr/service-charge')
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}
