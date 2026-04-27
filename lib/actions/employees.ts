'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import {
  employeeFormSchema,
  salaryStructureFormSchema,
  terminationSchema,
} from '@/lib/validators/employees'
import type { ActionResult, ActionData } from './types'

/**
 * EMPLOYEE SERVER ACTIONS — Phase 2
 *
 * `createEmployee` is special: it auto-creates a matching `expense_payees` row
 * (payee_type = 'staff') and links it via `employees.expense_payee_id`. This
 * is the integration spine — the payroll engine in Phase 4 writes finalized
 * salary `expenses` rows against this payee.
 */

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

function nullify<T extends Record<string, unknown>>(obj: T): T {
  // Convert empty strings → null so the DB stores NULL, not ''
  const out: Record<string, unknown> = { ...obj }
  for (const k of Object.keys(out)) {
    if (out[k] === '') out[k] = null
  }
  return out as T
}

async function nextEmployeeCode(): Promise<string> {
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any
  const { count } = await db
    .from('employees')
    .select('id', { count: 'exact', head: true })
  const next = (count ?? 0) + 1
  return `GCR-${String(next).padStart(3, '0')}`
}

// ─── Employee CRUD ───────────────────────────────────────────────────────────

export async function createEmployee(input: unknown): Promise<ActionData<{ id: string }>> {
  try {
    const parsed = employeeFormSchema.parse(input)
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any

    const employeeCode = parsed.employee_code && parsed.employee_code.length > 0
      ? parsed.employee_code
      : await nextEmployeeCode()

    // 1. Create the matching `expense_payees` row first so we can link it.
    //    payee_type = 'staff' is the agreed convention.
    const { data: payeeRow, error: payeeErr } = await db
      .from('expense_payees')
      .insert({
        name:          parsed.full_name,
        payee_type:    'staff',
        phone:         parsed.phone || null,
        notes:         `Auto-created for staff ${employeeCode}`,
        is_active:     true,
        display_order: 0,
      })
      .select('id')
      .single()
    if (payeeErr || !payeeRow) {
      return {
        success: false,
        error:   `Could not create expense payee: ${payeeErr?.message ?? 'unknown error'}`,
      }
    }

    // 2. Create the employee, linking to the new payee.
    const empPayload = nullify({
      employee_code:        employeeCode,
      full_name:            parsed.full_name,
      photo_url:            parsed.photo_url ?? null,
      designation:          parsed.designation,
      department:           parsed.department,
      nid_number:           parsed.nid_number ?? null,
      date_of_birth:        parsed.date_of_birth ?? null,
      gender:               parsed.gender ?? null,
      blood_group:          parsed.blood_group ?? null,
      phone:                parsed.phone,
      email:                parsed.email ?? null,
      present_address:      parsed.present_address ?? null,
      permanent_address:    parsed.permanent_address ?? null,
      emergency_contact_name:     parsed.emergency_contact_name ?? null,
      emergency_contact_phone:    parsed.emergency_contact_phone ?? null,
      emergency_contact_relation: parsed.emergency_contact_relation ?? null,
      joining_date:         parsed.joining_date,
      employment_status:    'active',
      is_live_in:           parsed.is_live_in,
      meal_allowance_in_kind: parsed.meal_allowance_in_kind,
      expense_payee_id:     payeeRow.id,
      notes:                parsed.notes ?? null,
    })

    const { data: empRow, error: empErr } = await db
      .from('employees')
      .insert(empPayload)
      .select('id')
      .single()

    if (empErr || !empRow) {
      // Rollback the payee row to avoid orphans
      await db.from('expense_payees').delete().eq('id', payeeRow.id)
      return { success: false, error: empErr?.message ?? 'Insert failed' }
    }

    await logHistory(empRow.id, 'created', 'employee_created', {
      employee_code: employeeCode,
      department:    parsed.department,
      payee_id:      payeeRow.id,
    })

    revalidatePath('/hr')
    revalidatePath('/hr/employees')
    return { success: true, data: { id: empRow.id } }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function updateEmployee(id: string, input: unknown): Promise<ActionResult> {
  try {
    const parsed = employeeFormSchema.parse(input)
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any

    const update = nullify({
      // Don't change `employee_code` here unless caller explicitly set one.
      ...(parsed.employee_code && parsed.employee_code.length > 0
        ? { employee_code: parsed.employee_code }
        : {}),
      full_name:            parsed.full_name,
      photo_url:            parsed.photo_url ?? null,
      designation:          parsed.designation,
      department:           parsed.department,
      nid_number:           parsed.nid_number ?? null,
      date_of_birth:        parsed.date_of_birth ?? null,
      gender:               parsed.gender ?? null,
      blood_group:          parsed.blood_group ?? null,
      phone:                parsed.phone,
      email:                parsed.email ?? null,
      present_address:      parsed.present_address ?? null,
      permanent_address:    parsed.permanent_address ?? null,
      emergency_contact_name:     parsed.emergency_contact_name ?? null,
      emergency_contact_phone:    parsed.emergency_contact_phone ?? null,
      emergency_contact_relation: parsed.emergency_contact_relation ?? null,
      joining_date:         parsed.joining_date,
      is_live_in:           parsed.is_live_in,
      meal_allowance_in_kind: parsed.meal_allowance_in_kind,
      notes:                parsed.notes ?? null,
    })

    const { error } = await db.from('employees').update(update).eq('id', id)
    if (error) return { success: false, error: error.message }

    // Keep the linked payee's display name in sync so future expenses show the new name.
    const { data: emp } = await db
      .from('employees')
      .select('expense_payee_id')
      .eq('id', id)
      .single()
    if (emp?.expense_payee_id) {
      await db
        .from('expense_payees')
        .update({ name: parsed.full_name, phone: parsed.phone || null })
        .eq('id', emp.expense_payee_id)
    }

    await logHistory(id, 'edited', 'employee_edited', {
      department: parsed.department,
    })

    revalidatePath('/hr/employees')
    revalidatePath(`/hr/employees/${id}`)
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function terminateEmployee(
  id: string,
  input: unknown,
): Promise<ActionResult> {
  try {
    const parsed = terminationSchema.parse(input)
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any

    const { error } = await db
      .from('employees')
      .update({
        employment_status:  parsed.status,
        termination_date:   parsed.termination_date,
        termination_reason: parsed.termination_reason,
      })
      .eq('id', id)
    if (error) return { success: false, error: error.message }

    // Close any currently-open salary structure on the termination date.
    await db
      .from('salary_structures')
      .update({ effective_to: parsed.termination_date })
      .eq('employee_id', id)
      .is('effective_to', null)

    await logHistory(id, 'edited', 'employee_terminated', {
      termination_date:   parsed.termination_date,
      termination_reason: parsed.termination_reason,
      status:             parsed.status,
    })

    revalidatePath('/hr/employees')
    revalidatePath(`/hr/employees/${id}`)
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function reactivateEmployee(id: string): Promise<ActionResult> {
  try {
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any

    const { error } = await db
      .from('employees')
      .update({
        employment_status:  'active',
        termination_date:   null,
        termination_reason: null,
      })
      .eq('id', id)
    if (error) return { success: false, error: error.message }

    await logHistory(id, 'edited', 'employee_reactivated', {})
    revalidatePath('/hr/employees')
    revalidatePath(`/hr/employees/${id}`)
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

// ─── Salary structure ────────────────────────────────────────────────────────

/**
 * Closes the current effective row (sets `effective_to = new effective_from - 1 day`)
 * before inserting the new structure. Never edits historical rows in place — the
 * salary history is the audit trail.
 */
export async function setSalaryStructure(
  employeeId: string,
  input: unknown,
): Promise<ActionData<{ id: string }>> {
  try {
    const parsed = salaryStructureFormSchema.parse(input)
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any

    // Compute previous effective_from + 1 day → new effective_from - 1 day for closing.
    const efFrom = new Date(parsed.effective_from + 'T00:00:00')
    const closeOn = new Date(efFrom)
    closeOn.setDate(closeOn.getDate() - 1)
    const closeOnIso = closeOn.toISOString().slice(0, 10)

    // Close any open structure for this employee.
    await db
      .from('salary_structures')
      .update({ effective_to: closeOnIso })
      .eq('employee_id', employeeId)
      .is('effective_to', null)

    const { data, error } = await db
      .from('salary_structures')
      .insert({
        employee_id:     employeeId,
        effective_from:  parsed.effective_from,
        effective_to:    null,
        basic:           parsed.basic,
        house_rent:      parsed.house_rent,
        medical:         parsed.medical,
        transport:       parsed.transport,
        mobile:          parsed.mobile,
        other_allowance: parsed.other_allowance,
        notes:           parsed.notes ?? null,
      })
      .select('id')
      .single()
    if (error || !data) return { success: false, error: error?.message ?? 'Insert failed' }

    await logHistory(employeeId, 'edited', 'salary_structure_set', {
      structure_id:   data.id,
      effective_from: parsed.effective_from,
      basic:          parsed.basic,
    })

    revalidatePath(`/hr/employees/${employeeId}`)
    return { success: true, data: { id: data.id } }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

// Reuse currentUserId import marker so the helper isn't tree-shaken if used later.
export async function _employeeActionsHealthCheck(): Promise<string | null> {
  await currentUserId()
  return null
}
