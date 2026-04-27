'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { computePayrollLine, type PayrollLine, type AttendanceCounts } from '@/lib/engine/payroll'
import { summariseAttendanceForMonth } from '@/lib/queries/attendance'
import type { ActionResult, ActionData } from './types'
import type {
  EmployeeRow,
  LoanRow,
  SalaryAdjustmentRow,
  SalaryStructureRow,
} from '@/lib/supabase/types'

// ─── helpers ─────────────────────────────────────────────────────────────────

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
      entity_type: 'payroll_run',
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

function emptyAttendance(): AttendanceCounts {
  return {
    days_present: 0, days_absent: 0,
    days_paid_leave: 0, days_unpaid_leave: 0,
    days_weekly_off: 0, days_holiday: 0,
    days_half_day: 0, total_marked: 0,
  }
}

/**
 * Validates the period is YYYY-MM-01 and that today is on/after that month +1
 * (you can finalize a month from the 1st of the next month onward).
 */
function validatePeriod(periodIso: string): string | null {
  if (!/^\d{4}-\d{2}-01$/.test(periodIso)) return 'Period must be YYYY-MM-01'
  return null
}

function periodMonthIso(periodIso: string): string {
  return periodIso.slice(0, 7)   // YYYY-MM
}

interface PayrollPreviewResult {
  period:      string
  status:      'draft' | 'finalized'
  lines:       (PayrollLine & {
    full_name:     string
    employee_code: string
  })[]
  total_gross: number
  total_net:   number
  /** Set when the period is already finalized — UI should hide the Finalize button. */
  finalized_at: string | null
}

/**
 * Pure read-only preview. Does NOT persist anything. Used by the payroll
 * page's preview tab.
 */
export async function previewPayrollRun(
  periodIso: string,
): Promise<ActionData<PayrollPreviewResult>> {
  try {
    const err = validatePeriod(periodIso)
    if (err) return { success: false, error: err }

    const monthIso = periodMonthIso(periodIso)
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any

    // 1. Active employees (active or on_leave)
    const { data: empData, error: empErr } = await db
      .from('employees')
      .select('id, employee_code, full_name, department, expense_payee_id, employment_status')
      .in('employment_status', ['active', 'on_leave'])
      .order('full_name', { ascending: true })
    if (empErr) return { success: false, error: empErr.message }
    const employees = (empData ?? []) as Pick<EmployeeRow, 'id' | 'employee_code' | 'full_name' | 'department' | 'expense_payee_id' | 'employment_status'>[]
    const empIds = employees.map((e) => e.id)
    if (empIds.length === 0) {
      return {
        success: true,
        data: {
          period: periodIso, status: 'draft', lines: [],
          total_gross: 0, total_net: 0, finalized_at: null,
        },
      }
    }

    // 2. Existing run (if any) — surface its status to the UI
    const { data: existingRun } = await db
      .from('payroll_runs').select('status, finalized_at').eq('period', periodIso).maybeSingle()

    // 3. Currently-effective salary structures for these employees
    const { data: salaryData } = await db
      .from('salary_structures')
      .select('*')
      .in('employee_id', empIds)
      .is('effective_to', null)
    const salaryByEmp = new Map<string, SalaryStructureRow>()
    for (const s of (salaryData ?? []) as any[]) {
      salaryByEmp.set(s.employee_id, {
        ...s,
        basic:           Number(s.basic),
        house_rent:      Number(s.house_rent),
        medical:         Number(s.medical),
        transport:       Number(s.transport),
        mobile:          Number(s.mobile),
        other_allowance: Number(s.other_allowance),
        gross:           Number(s.gross),
      } as SalaryStructureRow)
    }

    // 4. Attendance summary
    const attendanceMap = await summariseAttendanceForMonth(monthIso)

    // 5. Adjustments scoped to this period (excluding loan_repayment — auto-generated)
    const { data: adjData } = await db
      .from('salary_adjustments')
      .select('*')
      .eq('applies_to_month', periodIso)
      .neq('type', 'loan_repayment')
    const adjByEmp = new Map<string, SalaryAdjustmentRow[]>()
    for (const a of (adjData ?? []) as any[]) {
      const list = adjByEmp.get(a.employee_id) ?? []
      list.push({ ...a, amount: Number(a.amount) })
      adjByEmp.set(a.employee_id, list)
    }

    // 6. Active loans
    const { data: loanData } = await db
      .from('loans')
      .select('*')
      .in('employee_id', empIds)
      .eq('status', 'active')
    const loansByEmp = new Map<string, LoanRow[]>()
    for (const l of (loanData ?? []) as any[]) {
      const row: LoanRow = {
        ...l,
        principal:           Number(l.principal),
        monthly_installment: Number(l.monthly_installment),
        amount_repaid:       Number(l.amount_repaid),
        outstanding:         Number(l.outstanding),
      }
      const list = loansByEmp.get(l.employee_id) ?? []
      list.push(row)
      loansByEmp.set(l.employee_id, list)
    }

    // 7. Service-charge payouts
    const { data: scData } = await db
      .from('service_charge_payouts')
      .select('employee_id, amount')
      .eq('applies_to_month', periodIso)
    const scByEmp = new Map<string, number>()
    for (const r of (scData ?? []) as { employee_id: string; amount: number | string }[]) {
      scByEmp.set(r.employee_id, Number(r.amount))
    }

    // 8. Build lines, skipping employees with no salary structure
    const lines: PayrollPreviewResult['lines'] = []
    let totalGross = 0
    let totalNet   = 0

    for (const emp of employees) {
      const salary = salaryByEmp.get(emp.id)
      if (!salary) continue

      const att = attendanceMap.get(emp.id) ?? { employee_id: emp.id, ...emptyAttendance() }
      const adjustments = adjByEmp.get(emp.id) ?? []
      const loans       = loansByEmp.get(emp.id) ?? []
      const sc          = scByEmp.get(emp.id) ?? 0

      const line = computePayrollLine({
        employeeId:    emp.id,
        monthIso:      periodIso,
        salary,
        attendance: {
          days_present:      att.days_present,
          days_absent:       att.days_absent,
          days_paid_leave:   att.days_paid_leave,
          days_unpaid_leave: att.days_unpaid_leave,
          days_weekly_off:   att.days_weekly_off,
          days_holiday:      att.days_holiday,
          days_half_day:     att.days_half_day,
          total_marked:      att.total_marked,
        },
        adjustments,
        loans,
        serviceCharge: sc,
      })

      totalGross += line.gross
      totalNet   += line.net_pay
      lines.push({ ...line, full_name: emp.full_name, employee_code: emp.employee_code })
    }

    return {
      success: true,
      data: {
        period:       periodIso,
        status:       (existingRun?.status as 'draft' | 'finalized') ?? 'draft',
        lines,
        total_gross:  totalGross,
        total_net:    totalNet,
        finalized_at: existingRun?.finalized_at ?? null,
      },
    }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * Persists the preview as a finalized run:
 *   1. Insert (or upsert) `payroll_runs` row with status='finalized'
 *   2. Insert one `payroll_run_lines` row per line
 *   3. For each loan_breakdown entry: insert a `salary_adjustments` row of type
 *      'loan_repayment' AND link `payroll_run_line_id`. Increment
 *      `loans.amount_repaid`. Auto-close loan if outstanding hits 0.
 *   4. Update existing month-scoped `salary_adjustments` rows with the
 *      `payroll_run_line_id` link (so they become read-only in the UI).
 *   5. For each line: write an `expenses` row in the 'salary' category,
 *      against the staff's `expense_payee_id`. Save the new expense_id back
 *      onto the `payroll_run_lines` row.
 *
 * NOT a single transaction (Supabase JS doesn't expose one) — but each step
 * is idempotent enough that re-running after a partial failure is safe:
 * we look up existing rows before inserting.
 */
export async function finalizePayrollRun(
  periodIso: string,
  paymentMethod: 'cash' | 'bkash' | 'nagad' | 'rocket' | 'bank_transfer' | 'cheque' | 'other' = 'cash',
): Promise<ActionData<{ run_id: string; expenses_written: number }>> {
  try {
    const periodErr = validatePeriod(periodIso)
    if (periodErr) return { success: false, error: periodErr }

    // Guard: can finalize from the 1st of the next month onward
    const periodDate = new Date(periodIso + 'T00:00:00')
    const earliest   = new Date(periodDate.getFullYear(), periodDate.getMonth() + 1, 1)
    if (new Date() < earliest) {
      return {
        success: false,
        error:   `Cannot finalize until ${earliest.toISOString().slice(0, 10)} (1st of next month).`,
      }
    }

    const preview = await previewPayrollRun(periodIso)
    if (!preview.success) return { success: false, error: preview.error }
    if (preview.data.status === 'finalized') {
      return { success: false, error: 'This period has already been finalized.' }
    }
    if (preview.data.lines.length === 0) {
      return { success: false, error: 'No payroll lines to finalize. Add salaried employees first.' }
    }

    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any
    const userId = await currentUserId()

    // 1. Look up the salary expense category by slug; fall back to category_group='salary'.
    let { data: salaryCat } = await db
      .from('expense_categories')
      .select('id')
      .eq('slug', 'salary')
      .maybeSingle()
    if (!salaryCat) {
      const { data: anyCat } = await db
        .from('expense_categories')
        .select('id')
        .eq('category_group', 'salary')
        .order('display_order', { ascending: true })
        .limit(1)
        .maybeSingle()
      salaryCat = anyCat
    }
    if (!salaryCat?.id) {
      return {
        success: false,
        error:   'No expense category found for salary. Create one (slug = "salary" or category_group = "salary") first.',
      }
    }

    // 2. Upsert the payroll run — keep id stable for re-runs
    const { data: existingRun } = await db
      .from('payroll_runs').select('id, status').eq('period', periodIso).maybeSingle()
    if (existingRun?.status === 'finalized') {
      return { success: false, error: 'Already finalized.' }
    }

    let runId = existingRun?.id as string | undefined
    if (runId) {
      await db.from('payroll_runs').update({
        status:        'finalized',
        finalized_at:  new Date().toISOString(),
        finalized_by:  userId,
        total_gross:   preview.data.total_gross,
        total_net:     preview.data.total_net,
      }).eq('id', runId)
    } else {
      const { data: newRun, error: runErr } = await db
        .from('payroll_runs')
        .insert({
          period:       periodIso,
          status:       'finalized',
          generated_by: userId,
          finalized_at: new Date().toISOString(),
          finalized_by: userId,
          total_gross:  preview.data.total_gross,
          total_net:    preview.data.total_net,
        })
        .select('id')
        .single()
      if (runErr || !newRun) return { success: false, error: runErr?.message ?? 'Failed to create run' }
      runId = newRun.id
    }

    // 3. Per-line work
    const periodLabel = periodDate.toLocaleString('en-US', { month: 'long', year: 'numeric' })
    let expensesWritten = 0

    // Pull employee → expense_payee_id map once
    const empIds = preview.data.lines.map((l) => l.employee_id)
    const { data: empData } = await db
      .from('employees')
      .select('id, expense_payee_id, full_name, employee_code')
      .in('id', empIds)
    const empById = new Map<string, { expense_payee_id: string | null; full_name: string; employee_code: string }>()
    for (const e of (empData ?? []) as any[]) empById.set(e.id, e)

    // Pre-fetch existing line ids for idempotency on retries
    const { data: existingLineRows } = await db
      .from('payroll_run_lines').select('id, employee_id').eq('payroll_run_id', runId)
    const existingLineByEmp = new Map<string, string>()
    for (const l of (existingLineRows ?? []) as { id: string; employee_id: string }[]) {
      existingLineByEmp.set(l.employee_id, l.id)
    }

    for (const line of preview.data.lines) {
      const lineInsert = {
        payroll_run_id:    runId,
        employee_id:       line.employee_id,
        basic:             line.basic,
        house_rent:        line.house_rent,
        medical:           line.medical,
        transport:         line.transport,
        mobile:            line.mobile,
        other_allowance:   line.other_allowance,
        gross:             line.gross,
        days_in_month:     line.days_in_month,
        days_present:      line.days_present,
        days_absent:       line.days_absent,
        days_paid_leave:   line.days_paid_leave,
        days_unpaid_leave: line.days_unpaid_leave,
        days_weekly_off:   line.days_weekly_off,
        days_holiday:      line.days_holiday,
        unpaid_deduction:  line.unpaid_deduction,
        bonuses:           line.bonuses,
        eid_bonus:         line.eid_bonus,
        other_additions:   line.other_additions,
        fines:             line.fines,
        advance_deduction: line.advance_deduction,
        loan_deduction:    line.loan_deduction,
        other_deductions:  line.other_deductions,
        service_charge:    line.service_charge,
        net_pay:           line.net_pay,
        payment_method:    paymentMethod,
        paid_at:           new Date().toISOString(),
      }

      let lineId: string | undefined = existingLineByEmp.get(line.employee_id)
      if (lineId) {
        await db.from('payroll_run_lines').update(lineInsert).eq('id', lineId)
      } else {
        const { data: ins, error: insErr } = await db
          .from('payroll_run_lines').insert(lineInsert).select('id').single()
        if (insErr || !ins) {
          console.warn(`[payroll] line insert failed for ${line.employee_id}: ${insErr?.message}`)
          continue
        }
        lineId = ins.id
      }

      // 3a. Insert loan_repayment salary_adjustments + bump loan progress
      for (const lb of line.loan_breakdown) {
        // Avoid double-inserting on retry — check for an existing one tied to this run line
        const { data: existingLoanAdj } = await db
          .from('salary_adjustments')
          .select('id')
          .eq('payroll_run_line_id', lineId)
          .eq('loan_id', lb.loan_id)
          .maybeSingle()
        if (existingLoanAdj?.id) continue

        await db.from('salary_adjustments').insert({
          employee_id:        line.employee_id,
          applies_to_month:   periodIso,
          type:               'loan_repayment',
          amount:             lb.amount,
          description:        `Auto-deducted for ${periodLabel}`,
          loan_id:            lb.loan_id,
          payroll_run_line_id: lineId,
          created_by:         userId,
        })

        // Increment amount_repaid; auto-close on full repayment
        const { data: loanRow } = await db
          .from('loans')
          .select('principal, amount_repaid, status')
          .eq('id', lb.loan_id)
          .single()
        if (loanRow) {
          const newRepaid = Math.min(Number(loanRow.principal), Number(loanRow.amount_repaid) + lb.amount)
          const isClosed  = newRepaid >= Number(loanRow.principal)
          await db.from('loans')
            .update({
              amount_repaid: newRepaid,
              status:        isClosed ? 'closed' : loanRow.status,
            })
            .eq('id', lb.loan_id)
        }
      }

      // 3b. Link existing user-entered adjustments to this line so they become read-only
      await db.from('salary_adjustments')
        .update({ payroll_run_line_id: lineId })
        .eq('applies_to_month', periodIso)
        .eq('employee_id', line.employee_id)
        .neq('type', 'loan_repayment')
        .is('payroll_run_line_id', null)

      // 3c. Auto-write the salary expense — one per staff per finalized line
      const emp = empById.get(line.employee_id)
      if (emp?.expense_payee_id && line.net_pay > 0) {
        const expenseDate = new Date(periodDate.getFullYear(), periodDate.getMonth() + 1, 0)  // last day of month
          .toISOString().slice(0, 10)
        const description = `Salary ${periodLabel} — ${emp.full_name} (${emp.employee_code})`
        const { data: insExp, error: expErr } = await db
          .from('expenses')
          .insert({
            expense_date:   expenseDate,
            category_id:    salaryCat.id,
            payee_id:       emp.expense_payee_id,
            description,
            amount:         line.net_pay,
            payment_method: paymentMethod,
            is_draft:       false,
            created_by:     userId,
          })
          .select('id')
          .single()
        if (!expErr && insExp?.id) {
          await db.from('payroll_run_lines').update({ expense_id: insExp.id }).eq('id', lineId)
          expensesWritten += 1
        } else if (expErr) {
          console.warn(`[payroll] expense insert failed for ${emp.employee_code}: ${expErr.message}`)
        }
      }
    }

    await logHistory(runId!, 'edited', 'payroll_finalized', {
      period:           periodIso,
      total_gross:      preview.data.total_gross,
      total_net:        preview.data.total_net,
      lines:            preview.data.lines.length,
      expenses_written: expensesWritten,
    })

    revalidatePath('/hr/payroll')
    revalidatePath(`/hr/payroll/${periodIso}`)
    revalidatePath('/expenses')
    revalidatePath('/')
    return { success: true, data: { run_id: runId!, expenses_written: expensesWritten } }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * Convenience action that just persists the preview as a draft (status='draft')
 * without writing expenses or loan_repayment adjustments. Lets the operator
 * snapshot the in-progress month for later finalization.
 */
export async function saveDraftPayrollRun(
  periodIso: string,
): Promise<ActionResult> {
  try {
    const err = validatePeriod(periodIso)
    if (err) return { success: false, error: err }
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any
    const userId = await currentUserId()
    const preview = await previewPayrollRun(periodIso)
    if (!preview.success) return { success: false, error: preview.error }

    const { data: existing } = await db
      .from('payroll_runs').select('id, status').eq('period', periodIso).maybeSingle()
    if (existing?.status === 'finalized') return { success: false, error: 'Already finalized.' }

    if (existing?.id) {
      await db.from('payroll_runs').update({
        total_gross: preview.data.total_gross,
        total_net:   preview.data.total_net,
      }).eq('id', existing.id)
    } else {
      await db.from('payroll_runs').insert({
        period:      periodIso,
        status:      'draft',
        generated_by: userId,
        total_gross: preview.data.total_gross,
        total_net:   preview.data.total_net,
      })
    }
    revalidatePath('/hr/payroll')
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}
