'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { serviceChargeFormSchema } from '@/lib/validators/hr'
import type { ActionResult, ActionData } from './types'

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
 * UPSERT semantics — there's a UNIQUE index on (employee_id, applies_to_month).
 * Re-saving overwrites the previous amount.
 */
export async function upsertServiceCharge(
  input: unknown,
): Promise<ActionData<{ id: string }>> {
  try {
    const parsed = serviceChargeFormSchema.parse(input)
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any
    const userId = await currentUserId()

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
  try {
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any
    const { data: row } = await db
      .from('service_charge_payouts')
      .select('id, employee_id')
      .eq('id', id)
      .single()
    if (!row) return { success: false, error: 'Not found' }
    const { error } = await db.from('service_charge_payouts').delete().eq('id', id)
    if (error) return { success: false, error: error.message }
    await logHistory(row.employee_id, 'edited', 'service_charge_deleted', {})
    revalidatePath('/hr/service-charge')
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}
