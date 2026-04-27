import { createClient } from '@/lib/supabase/server'
import type {
  PayrollRunRow,
  PayrollRunLineRow,
  EmployeeRow,
} from '@/lib/supabase/types'

export interface PayrollRunWithLines extends PayrollRunRow {
  lines: (PayrollRunLineRow & {
    employee: Pick<EmployeeRow, 'id' | 'employee_code' | 'full_name' | 'department' | 'expense_payee_id'>
  })[]
}

function coerceLine(r: any): PayrollRunLineRow {
  return {
    ...r,
    basic:             Number(r.basic),
    house_rent:        Number(r.house_rent),
    medical:           Number(r.medical),
    transport:         Number(r.transport),
    mobile:            Number(r.mobile),
    other_allowance:   Number(r.other_allowance),
    gross:             Number(r.gross),
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
  }
}

export async function getPayrollRuns(): Promise<PayrollRunRow[]> {
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any
  const { data, error } = await db
    .from('payroll_runs')
    .select('*')
    .order('period', { ascending: false })
  if (error) throw new Error(`getPayrollRuns: ${error.message}`)
  return (data ?? []).map((r: any) => ({
    ...r,
    total_gross: Number(r.total_gross),
    total_net:   Number(r.total_net),
  })) as PayrollRunRow[]
}

export async function getPayrollRunByPeriod(
  periodIso: string,
): Promise<PayrollRunWithLines | null> {
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any
  const { data: run } = await db
    .from('payroll_runs')
    .select('*')
    .eq('period', periodIso)
    .maybeSingle()
  if (!run) return null

  const { data: lines } = await db
    .from('payroll_run_lines')
    .select(`
      *,
      employee:employees!inner (id, employee_code, full_name, department, expense_payee_id)
    `)
    .eq('payroll_run_id', run.id)

  return {
    ...run,
    total_gross: Number(run.total_gross),
    total_net:   Number(run.total_net),
    lines: (lines ?? []).map(coerceLine).map((l: any) => l) as PayrollRunWithLines['lines'],
  }
}
