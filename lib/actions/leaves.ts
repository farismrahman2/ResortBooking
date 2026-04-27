'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
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

/**
 * Initialises leave_balances for the given year for every active employee
 * × every active leave_type. Sets opening_balance = leave_type.default_annual_balance.
 *
 * Idempotent: existing rows are left untouched. Cross-year carry-over is a v2
 * concern — v1 simply opens the year fully accrued.
 */
export async function initializeLeaveBalances(
  year: number,
): Promise<ActionData<{ created: number; skipped: number }>> {
  try {
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any

    const [{ data: employees }, { data: leaveTypes }] = await Promise.all([
      db.from('employees').select('id, full_name')
        .in('employment_status', ['active', 'on_leave']),
      db.from('leave_types').select('id, slug, default_annual_balance').eq('is_active', true),
    ])

    let created = 0
    let skipped = 0
    const empList = (employees ?? []) as { id: string; full_name: string }[]
    const ltList  = (leaveTypes ?? []) as { id: string; slug: string; default_annual_balance: number }[]

    for (const emp of empList) {
      for (const lt of ltList) {
        const { data: existing } = await db
          .from('leave_balances')
          .select('id')
          .eq('employee_id', emp.id)
          .eq('leave_type_id', lt.id)
          .eq('year', year)
          .maybeSingle()
        if (existing) { skipped += 1; continue }
        const { error } = await db.from('leave_balances').insert({
          employee_id:     emp.id,
          leave_type_id:   lt.id,
          year,
          opening_balance: Number(lt.default_annual_balance ?? 0),
          accrued:         0,
          used:            0,
        })
        if (error) { skipped += 1; continue }
        created += 1
      }
    }

    if (empList.length > 0) {
      await logHistory(empList[0].id, 'edited', 'leave_balances_initialized', {
        year, created, skipped,
      })
    }
    revalidatePath('/hr/leaves')
    return { success: true, data: { created, skipped } }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function adjustLeaveBalance(
  balanceId: string,
  patch: { opening_balance?: number; accrued?: number; used?: number },
): Promise<ActionResult> {
  try {
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any
    const { error } = await db
      .from('leave_balances')
      .update(patch)
      .eq('id', balanceId)
    if (error) return { success: false, error: error.message }
    revalidatePath('/hr/leaves')
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}
