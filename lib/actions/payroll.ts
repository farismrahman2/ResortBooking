'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { computePayrollLine, type PayrollLine, type AttendanceCounts } from '@/lib/engine/payroll'
import { summariseAttendanceForMonth } from '@/lib/queries/attendance'
import type { ActionResult, ActionData } from './types'
import { requirePermission } from '@/lib/auth/permissions'
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
  await requirePermission('hr', 'write')
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
      .from('payroll_runs')
      .select('id, status, finalized_at, total_gross, total_net')
      .eq('period', periodIso)
      .maybeSingle()

    // 2b. A FINALIZED month is a paid month: what was disbursed lives in
    // payroll_run_lines, frozen at finalize time. Recomputing it live (the old
    // behaviour) silently drifted from what was actually paid the moment any
    // attendance row, adjustment, or salary structure changed afterwards.
    if (existingRun?.status === 'finalized') {
      const { data: storedLines } = await db
        .from('payroll_run_lines')
        .select('*, employee:employees(full_name, employee_code)')
        .eq('payroll_run_id', existingRun.id)
      const lines: PayrollPreviewResult['lines'] = ((storedLines ?? []) as any[]).map((r) => ({
        employee_id:       r.employee_id,
        basic:             Number(r.basic),
        house_rent:        Number(r.house_rent),
        medical:           Number(r.medical),
        transport:         Number(r.transport),
        mobile:            Number(r.mobile),
        other_allowance:   Number(r.other_allowance),
        gross:             Number(r.gross),
        days_in_month:     Number(r.days_in_month),
        days_present:      Number(r.days_present),
        days_absent:       Number(r.days_absent),
        days_paid_leave:   Number(r.days_paid_leave),
        days_unpaid_leave: Number(r.days_unpaid_leave),
        days_weekly_off:   Number(r.days_weekly_off),
        days_holiday:      Number(r.days_holiday),
        unpaid_deduction:  Number(r.unpaid_deduction),
        bonuses:           Number(r.bonuses),
        eid_bonus:         Number(r.eid_bonus),
        other_additions:   Number(r.other_additions),
        fines:             Number(r.fines),
        advance_deduction: Number(r.advance_deduction),
        loan_deduction:    Number(r.loan_deduction),
        other_deductions:  Number(r.other_deductions),
        service_charge:    Number(r.service_charge),
        net_pay:           Number(r.net_pay),
        loan_breakdown:    [],
        full_name:         r.employee?.full_name ?? '(deleted employee)',
        employee_code:     r.employee?.employee_code ?? '—',
      }))
      lines.sort((a, b) => a.full_name.localeCompare(b.full_name))
      return {
        success: true,
        data: {
          period:       periodIso,
          status:       'finalized',
          lines,
          total_gross:  Number(existingRun.total_gross ?? lines.reduce((n, l) => n + l.gross, 0)),
          total_net:    Number(existingRun.total_net ?? lines.reduce((n, l) => n + l.net_pay, 0)),
          finalized_at: existingRun.finalized_at ?? null,
        },
      }
    }

    // 3. Salary structures effective DURING THIS PERIOD — not whichever is
    // open today. Using `.is('effective_to', null)` here meant a raise given
    // in July silently rewrote June's payroll when June was previewed or
    // finalized afterwards.
    const [pYear, pMonth] = periodIso.split('-').map(Number)
    const periodEnd = new Date(Date.UTC(pYear, pMonth, 0)).toISOString().slice(0, 10)  // last day of the month
    const { data: salaryData } = await db
      .from('salary_structures')
      .select('*')
      .in('employee_id', empIds)
      .lte('effective_from', periodEnd)
      .or(`effective_to.is.null,effective_to.gte.${periodIso}`)
      .order('effective_from', { ascending: false })
    const salaryByEmp = new Map<string, SalaryStructureRow>()
    for (const s of (salaryData ?? []) as any[]) {
      if (salaryByEmp.has(s.employee_id)) continue   // rows are newest-first; keep the latest effective in-period
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
  paymentMethod: 'cash' | 'bkash' | 'bank_transfer' | 'cheque' | 'other' = 'cash',
): Promise<ActionData<{ run_id: string; expenses_written: number }>> {
  await requirePermission('hr', 'write')
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

    // Claim the run ATOMICALLY. Two agents finalizing together both pass the
    // read guard above; without a predicate both proceeded and every salary
    // expense was written twice. The status predicate (update) and the UNIQUE
    // period constraint (insert) let exactly one through.
    let runId = existingRun?.id as string | undefined
    if (runId) {
      const { data: claimed, error: claimErr } = await db.from('payroll_runs').update({
        status:        'finalized',
        finalized_at:  new Date().toISOString(),
        finalized_by:  userId,
        total_gross:   preview.data.total_gross,
        total_net:     preview.data.total_net,
      }).eq('id', runId).neq('status', 'finalized').select('id')
      if (claimErr) return { success: false, error: claimErr.message }
      if (!claimed?.length) return { success: false, error: 'This period was just finalized by someone else.' }
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
      if (runErr || !newRun) {
        return {
          success: false,
          error: runErr?.code === '23505'
            ? 'This period was just finalized by someone else.'
            : runErr?.message ?? 'Failed to create run',
        }
      }
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

    // 3a. Upsert ALL lines in one round trip (UNIQUE(payroll_run_id,
    // employee_id) makes this a safe retry). The old per-employee loop made
    // ~6–8 sequential round trips per employee, so a 30-person payroll was
    // 200+ queries and regularly outlived the operator's patience.
    const paidAt = new Date().toISOString()
    const lineRows = preview.data.lines.map((line) => ({
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
      paid_at:           paidAt,
    }))
    const { data: upsertedLines, error: linesErr } = await db
      .from('payroll_run_lines')
      .upsert(lineRows, { onConflict: 'payroll_run_id,employee_id' })
      .select('id, employee_id, expense_id')
    if (linesErr) return { success: false, error: `Payroll lines failed to save: ${linesErr.message}` }
    const lineIdByEmp = new Map<string, string>()
    const lineHasExpense = new Set<string>()
    for (const l of (upsertedLines ?? []) as { id: string; employee_id: string; expense_id: string | null }[]) {
      lineIdByEmp.set(l.employee_id, l.id)
      if (l.expense_id) lineHasExpense.add(l.id)   // retry after a partial run: expense already written
    }
    const lineIds = [...lineIdByEmp.values()]

    // 3b. Loan repayments: one existence check for the whole run (idempotency
    // on retry), one batch insert of the missing adjustments, then per-loan
    // progress updates (each loan's new amount differs).
    const loanEntries: Array<{ employee_id: string; loan_id: string; amount: number; line_id: string }> = []
    for (const line of preview.data.lines) {
      const lineId = lineIdByEmp.get(line.employee_id)
      if (!lineId) continue
      for (const lb of line.loan_breakdown) {
        loanEntries.push({ employee_id: line.employee_id, loan_id: lb.loan_id, amount: lb.amount, line_id: lineId })
      }
    }
    if (loanEntries.length > 0) {
      const { data: existingLoanAdjs } = await db
        .from('salary_adjustments')
        .select('payroll_run_line_id, loan_id')
        .in('payroll_run_line_id', lineIds)
        .eq('type', 'loan_repayment')
      const already = new Set(
        ((existingLoanAdjs ?? []) as any[]).map((a) => `${a.payroll_run_line_id}:${a.loan_id}`),
      )
      const fresh = loanEntries.filter((e) => !already.has(`${e.line_id}:${e.loan_id}`))

      if (fresh.length > 0) {
        const { error: adjErr } = await db.from('salary_adjustments').insert(
          fresh.map((e) => ({
            employee_id:         e.employee_id,
            applies_to_month:    periodIso,
            type:                'loan_repayment',
            amount:              e.amount,
            description:         `Auto-deducted for ${periodLabel}`,
            loan_id:             e.loan_id,
            payroll_run_line_id: e.line_id,
            created_by:          userId,
          })),
        )
        if (adjErr) console.warn(`[payroll] loan adjustments insert failed: ${adjErr.message}`)

        // Bump each affected loan's progress; auto-close on full repayment.
        const { data: loanRows } = await db
          .from('loans')
          .select('id, principal, amount_repaid, status')
          .in('id', fresh.map((e) => e.loan_id))
        const loanById = new Map(((loanRows ?? []) as any[]).map((l) => [l.id, l]))
        for (const e of fresh) {
          const loanRow = loanById.get(e.loan_id)
          if (!loanRow) continue
          const newRepaid = Math.min(Number(loanRow.principal), Number(loanRow.amount_repaid) + e.amount)
          const isClosed  = newRepaid >= Number(loanRow.principal)
          await db.from('loans')
            .update({ amount_repaid: newRepaid, status: isClosed ? 'closed' : loanRow.status })
            .eq('id', e.loan_id)
        }
      }
    }

    // 3c. Link existing user-entered adjustments to their lines (read-only in
    // the UI afterwards). Values differ per employee, so this stays a loop —
    // but each is a single indexed UPDATE.
    for (const [employeeId, lineId] of lineIdByEmp) {
      await db.from('salary_adjustments')
        .update({ payroll_run_line_id: lineId })
        .eq('applies_to_month', periodIso)
        .eq('employee_id', employeeId)
        .neq('type', 'loan_repayment')
        .is('payroll_run_line_id', null)
    }

    // 3d. Auto-write the salary expenses in one batch insert, then link each
    // back to its payroll line.
    const expenseDate = new Date(periodDate.getFullYear(), periodDate.getMonth() + 1, 0)  // last day of month
      .toISOString().slice(0, 10)
    const expensePlans = preview.data.lines.flatMap((line) => {
      const emp = empById.get(line.employee_id)
      const lineId = lineIdByEmp.get(line.employee_id)
      if (!emp?.expense_payee_id || !(line.net_pay > 0) || !lineId) return []
      if (lineHasExpense.has(lineId)) return []   // don't double-book salary on retry
      return [{
        line_id: lineId,
        row: {
          expense_date:   expenseDate,
          category_id:    salaryCat.id,
          payee_id:       emp.expense_payee_id,
          description:    `Salary ${periodLabel} — ${emp.full_name} (${emp.employee_code})`,
          amount:         line.net_pay,
          payment_method: paymentMethod,
          is_draft:       false,
          created_by:     userId,
        },
      }]
    })
    if (expensePlans.length > 0) {
      const { data: insertedExpenses, error: expErr } = await db
        .from('expenses')
        .insert(expensePlans.map((p) => p.row))
        .select('id, description')
      if (expErr) {
        console.warn(`[payroll] expense batch insert failed: ${expErr.message}`)
      } else {
        // Match returned ids back by description (unique per employee+period).
        const idByDescription = new Map(
          ((insertedExpenses ?? []) as any[]).map((e) => [e.description, e.id]),
        )
        for (const p of expensePlans) {
          const expenseId = idByDescription.get(p.row.description)
          if (!expenseId) continue
          await db.from('payroll_run_lines').update({ expense_id: expenseId }).eq('id', p.line_id)
          expensesWritten += 1
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
  await requirePermission('hr', 'write')
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
