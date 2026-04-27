'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { adjustmentFormSchema } from '@/lib/validators/hr'
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

export async function createAdjustment(
  input: unknown,
): Promise<ActionData<{ id: string }>> {
  try {
    const parsed = adjustmentFormSchema.parse(input)
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any
    const userId = await currentUserId()

    const { data, error } = await db
      .from('salary_adjustments')
      .insert({
        employee_id:      parsed.employee_id,
        applies_to_month: parsed.applies_to_month,
        type:             parsed.type,
        amount:           parsed.amount,
        description:      parsed.description || null,
        loan_id:          null,                  // user-created adjustments never carry a loan ref
        created_by:       userId,
      })
      .select('id')
      .single()
    if (error || !data) return { success: false, error: error?.message ?? 'Insert failed' }

    await logHistory(parsed.employee_id, 'edited', 'adjustment_created', {
      type:   parsed.type,
      amount: parsed.amount,
      month:  parsed.applies_to_month,
    })

    revalidatePath(`/hr/employees/${parsed.employee_id}`)
    revalidatePath('/hr/payroll')
    return { success: true, data: { id: data.id } }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function deleteAdjustment(id: string): Promise<ActionResult> {
  try {
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any

    // Once locked into a finalized payroll run line, deletion is forbidden.
    const { data: adj } = await db
      .from('salary_adjustments')
      .select('id, employee_id, payroll_run_line_id')
      .eq('id', id)
      .single()
    if (!adj) return { success: false, error: 'Adjustment not found' }
    if (adj.payroll_run_line_id) {
      return { success: false, error: 'Cannot delete — this adjustment is part of a finalized payroll run.' }
    }

    const { error } = await db.from('salary_adjustments').delete().eq('id', id)
    if (error) return { success: false, error: error.message }

    await logHistory(adj.employee_id, 'edited', 'adjustment_deleted', { adjustment_id: id })
    revalidatePath(`/hr/employees/${adj.employee_id}`)
    revalidatePath('/hr/payroll')
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}
