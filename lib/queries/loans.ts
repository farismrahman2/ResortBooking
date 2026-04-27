import { createClient } from '@/lib/supabase/server'
import type { LoanRow, LoanStatus } from '@/lib/supabase/types'

export interface LoanWithEmployee extends LoanRow {
  employee: { id: string; full_name: string; employee_code: string }
}

function coerce(r: any): LoanWithEmployee {
  return {
    ...r,
    principal:           Number(r.principal),
    monthly_installment: Number(r.monthly_installment),
    amount_repaid:       Number(r.amount_repaid),
    outstanding:         Number(r.outstanding),
  }
}

export async function getLoans(opts: {
  status?: LoanStatus | 'any'
} = {}): Promise<LoanWithEmployee[]> {
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  let query = db
    .from('loans')
    .select(`
      *,
      employee:employees!inner (id, full_name, employee_code)
    `)
    .order('taken_on', { ascending: false })

  if (opts.status && opts.status !== 'any') query = query.eq('status', opts.status)

  const { data, error } = await query
  if (error) throw new Error(`getLoans: ${error.message}`)
  return (data ?? []).map(coerce)
}

export async function getActiveLoansForEmployee(
  employeeId: string,
): Promise<LoanRow[]> {
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any
  const { data, error } = await db
    .from('loans')
    .select('*')
    .eq('employee_id', employeeId)
    .eq('status', 'active')
    .order('taken_on', { ascending: true })
  if (error) throw new Error(`getActiveLoansForEmployee: ${error.message}`)
  return (data ?? []).map((r: any) => ({
    ...r,
    principal:           Number(r.principal),
    monthly_installment: Number(r.monthly_installment),
    amount_repaid:       Number(r.amount_repaid),
    outstanding:         Number(r.outstanding),
  })) as LoanRow[]
}
