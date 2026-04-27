'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { loanFormSchema } from '@/lib/validators/hr'
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
      entity_type: 'loan',
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

export async function createLoan(input: unknown): Promise<ActionData<{ id: string }>> {
  try {
    const parsed = loanFormSchema.parse(input)
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any

    const { data, error } = await db
      .from('loans')
      .insert({
        employee_id:         parsed.employee_id,
        principal:           parsed.principal,
        monthly_installment: parsed.monthly_installment,
        amount_repaid:       0,
        taken_on:            parsed.taken_on,
        repayment_starts:    parsed.repayment_starts,
        status:              'active',
        notes:               parsed.notes || null,
      })
      .select('id')
      .single()
    if (error || !data) return { success: false, error: error?.message ?? 'Insert failed' }

    await logHistory(data.id, 'created', 'loan_created', {
      employee_id: parsed.employee_id,
      principal:   parsed.principal,
    })

    revalidatePath('/hr/loans')
    revalidatePath(`/hr/employees/${parsed.employee_id}`)
    return { success: true, data: { id: data.id } }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function closeLoan(id: string): Promise<ActionResult> {
  try {
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any
    const { error } = await db.from('loans').update({ status: 'closed' }).eq('id', id)
    if (error) return { success: false, error: error.message }
    await logHistory(id, 'edited', 'loan_closed', {})
    revalidatePath('/hr/loans')
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function writeOffLoan(id: string): Promise<ActionResult> {
  try {
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any
    const { error } = await db.from('loans').update({ status: 'written_off' }).eq('id', id)
    if (error) return { success: false, error: error.message }
    await logHistory(id, 'edited', 'loan_written_off', {})
    revalidatePath('/hr/loans')
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}
