'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import {
  markAttendanceSchema,
  bulkMarkAttendanceSchema,
} from '@/lib/validators/hr'
import type { ActionResult, ActionData } from './types'
import type { AttendanceStatus } from '@/lib/supabase/types'

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
 * When attendance changes to/from `paid_leave`, the leave balance row's
 * `used` column is incremented or decremented accordingly. Best-effort —
 * a missing balance row is created on the fly with opening_balance from
 * leave_types.default_annual_balance.
 */
async function syncLeaveBalanceUsage(args: {
  employeeId:    string
  date:          string         // YYYY-MM-DD
  prevStatus:    AttendanceStatus | null
  prevLeaveType: string | null
  nextStatus:    AttendanceStatus
  nextLeaveType: string | null
}) {
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  const year = Number(args.date.slice(0, 4))
  const wasPaidLeave  = args.prevStatus === 'paid_leave' && args.prevLeaveType !== null
  const isNowPaidLeave = args.nextStatus === 'paid_leave' && args.nextLeaveType !== null

  // No-op if status didn't move into or out of paid_leave AND the type didn't change
  if (!wasPaidLeave && !isNowPaidLeave) return
  if (wasPaidLeave && isNowPaidLeave && args.prevLeaveType === args.nextLeaveType) return

  async function ensureBalanceRow(leaveTypeId: string) {
    const { data: existing } = await db
      .from('leave_balances')
      .select('id, used')
      .eq('employee_id', args.employeeId)
      .eq('leave_type_id', leaveTypeId)
      .eq('year', year)
      .maybeSingle()
    if (existing) return existing
    // Initialize from leave_type default
    const { data: lt } = await db
      .from('leave_types')
      .select('default_annual_balance')
      .eq('id', leaveTypeId)
      .single()
    const opening = Number(lt?.default_annual_balance ?? 0)
    const { data: inserted } = await db
      .from('leave_balances')
      .insert({
        employee_id:     args.employeeId,
        leave_type_id:   leaveTypeId,
        year,
        opening_balance: opening,
        accrued:         0,
        used:            0,
      })
      .select('id, used')
      .single()
    return inserted
  }

  // Decrement old leave-type's used
  if (wasPaidLeave && args.prevLeaveType) {
    const row = await ensureBalanceRow(args.prevLeaveType)
    if (row) {
      const newUsed = Math.max(0, Number(row.used ?? 0) - 1)
      await db.from('leave_balances').update({ used: newUsed }).eq('id', row.id)
    }
  }
  // Increment new leave-type's used
  if (isNowPaidLeave && args.nextLeaveType) {
    const row = await ensureBalanceRow(args.nextLeaveType)
    if (row) {
      const newUsed = Number(row.used ?? 0) + 1
      await db.from('leave_balances').update({ used: newUsed }).eq('id', row.id)
    }
  }
}

export async function markAttendance(input: unknown): Promise<ActionResult> {
  try {
    const parsed = markAttendanceSchema.parse(input)
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any
    const userId = await currentUserId()

    // paid_leave / unpaid_leave require a leave type
    if ((parsed.status === 'paid_leave' || parsed.status === 'unpaid_leave') && !parsed.leave_type_id) {
      return { success: false, error: 'A leave type is required for paid / unpaid leave.' }
    }

    // Look up existing row to get prev status (for leave balance sync)
    const { data: existing } = await db
      .from('attendance')
      .select('id, status, leave_type_id')
      .eq('employee_id', parsed.employee_id)
      .eq('date', parsed.date)
      .maybeSingle()

    if (existing) {
      const { error } = await db
        .from('attendance')
        .update({
          status:        parsed.status,
          leave_type_id: parsed.leave_type_id ?? null,
          notes:         parsed.notes ?? null,
          marked_by:     userId,
          marked_at:     new Date().toISOString(),
        })
        .eq('id', existing.id)
      if (error) return { success: false, error: error.message }

      await syncLeaveBalanceUsage({
        employeeId:    parsed.employee_id,
        date:          parsed.date,
        prevStatus:    existing.status as AttendanceStatus,
        prevLeaveType: existing.leave_type_id ?? null,
        nextStatus:    parsed.status,
        nextLeaveType: parsed.leave_type_id ?? null,
      })
    } else {
      const { error } = await db
        .from('attendance')
        .insert({
          employee_id:   parsed.employee_id,
          date:          parsed.date,
          status:        parsed.status,
          leave_type_id: parsed.leave_type_id ?? null,
          notes:         parsed.notes ?? null,
          marked_by:     userId,
        })
      if (error) return { success: false, error: error.message }

      await syncLeaveBalanceUsage({
        employeeId:    parsed.employee_id,
        date:          parsed.date,
        prevStatus:    null,
        prevLeaveType: null,
        nextStatus:    parsed.status,
        nextLeaveType: parsed.leave_type_id ?? null,
      })
    }

    await logHistory(parsed.employee_id, 'edited', 'attendance_marked', {
      date:   parsed.date,
      status: parsed.status,
    })

    revalidatePath('/hr/attendance')
    revalidatePath(`/hr/employees/${parsed.employee_id}`)
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function bulkMarkAttendance(
  input: unknown,
): Promise<ActionData<{ updated: number }>> {
  try {
    const parsed = bulkMarkAttendanceSchema.parse(input)
    let updated = 0
    for (const e of parsed.entries) {
      const r = await markAttendance({
        employee_id:   e.employee_id,
        date:          parsed.date,
        status:        e.status,
        leave_type_id: e.leave_type_id ?? null,
        notes:         e.notes ?? null,
      })
      if (r.success) updated += 1
    }
    revalidatePath('/hr/attendance')
    return { success: true, data: { updated } }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}
