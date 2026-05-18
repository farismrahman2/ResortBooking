import { createClient } from '@/lib/supabase/server'
import type {
  SalaryAdjustmentRow,
  SalaryAdjustmentType,
} from '@/lib/supabase/types'

export interface AdjustmentWithEmployee extends SalaryAdjustmentRow {
  employee: { id: string; full_name: string; employee_code: string }
}

function coerce(r: any): AdjustmentWithEmployee {
  return { ...r, amount: Number(r.amount) }
}

export async function getAdjustmentsForEmployee(
  employeeId: string,
  monthIso?: string,
): Promise<SalaryAdjustmentRow[]> {
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any
  let query = db
    .from('salary_adjustments')
    .select('*')
    .eq('employee_id', employeeId)
    .order('applies_to_month', { ascending: false })
    .order('created_at', { ascending: false })
  if (monthIso) query = query.eq('applies_to_month', monthIso)
  const { data, error } = await query
  if (error) throw new Error(`getAdjustmentsForEmployee: ${error.message}`)
  return (data ?? []).map((r: any) => ({ ...r, amount: Number(r.amount) }))
}

export async function getAdjustmentsForMonth(
  monthIso: string,   // YYYY-MM-01
): Promise<AdjustmentWithEmployee[]> {
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any
  const { data, error } = await db
    .from('salary_adjustments')
    .select(`
      *,
      employee:employees!inner (id, full_name, employee_code)
    `)
    .eq('applies_to_month', monthIso)
    .order('created_at', { ascending: false })
  if (error) throw new Error(`getAdjustmentsForMonth: ${error.message}`)
  return (data ?? []).map(coerce)
}

export interface AdjustmentSums {
  bonuses:           number    // sum of 'bonus'
  eid_bonus:         number
  other_additions:   number
  fines:             number
  advance_deduction: number
  loan_deduction:    number
  other_deductions:  number
}

export function emptyAdjustmentSums(): AdjustmentSums {
  return {
    bonuses: 0, eid_bonus: 0, other_additions: 0,
    fines: 0, advance_deduction: 0, loan_deduction: 0, other_deductions: 0,
  }
}

export function addAdjustment(
  sums: AdjustmentSums,
  type: SalaryAdjustmentType,
  amount: number,
): void {
  switch (type) {
    case 'bonus':           sums.bonuses           += amount; break
    case 'eid_bonus':       sums.eid_bonus         += amount; break
    case 'other_addition':  sums.other_additions   += amount; break
    case 'fine':            sums.fines             += amount; break
    case 'advance':         sums.advance_deduction += amount; break
    case 'loan_repayment':  sums.loan_deduction    += amount; break
    case 'other_deduction': sums.other_deductions  += amount; break
  }
}
