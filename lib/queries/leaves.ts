import { createClient } from '@/lib/supabase/server'
import type { LeaveTypeRow, LeaveBalanceRow } from '@/lib/supabase/types'

export async function getActiveLeaveTypes(): Promise<LeaveTypeRow[]> {
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any
  const { data, error } = await db
    .from('leave_types')
    .select('*')
    .eq('is_active', true)
    .order('display_order', { ascending: true })
  if (error) throw new Error(`getActiveLeaveTypes: ${error.message}`)
  return (data ?? []).map((r: any) => ({
    ...r,
    default_annual_balance: Number(r.default_annual_balance ?? 0),
  }))
}

export interface LeaveBalanceWithRefs extends LeaveBalanceRow {
  leave_type: Pick<LeaveTypeRow, 'id' | 'name' | 'slug' | 'is_paid'>
  employee: { id: string; full_name: string; employee_code: string }
}

export async function getLeaveBalancesForYear(year: number): Promise<LeaveBalanceWithRefs[]> {
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any
  const { data, error } = await db
    .from('leave_balances')
    .select(`
      *,
      leave_type:leave_types!inner (id, name, slug, is_paid),
      employee:employees!inner (id, full_name, employee_code, employment_status)
    `)
    .eq('year', year)
    .order('employee(full_name)', { ascending: true })
  if (error) throw new Error(`getLeaveBalancesForYear: ${error.message}`)
  return (data ?? []).map((r: any) => ({
    ...r,
    opening_balance: Number(r.opening_balance ?? 0),
    accrued:         Number(r.accrued ?? 0),
    used:            Number(r.used ?? 0),
    available:       Number(r.available ?? 0),
  })) as LeaveBalanceWithRefs[]
}

export async function getEmployeeLeaveBalances(
  employeeId: string,
  year: number,
): Promise<LeaveBalanceWithRefs[]> {
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any
  const { data, error } = await db
    .from('leave_balances')
    .select(`
      *,
      leave_type:leave_types!inner (id, name, slug, is_paid),
      employee:employees!inner (id, full_name, employee_code)
    `)
    .eq('employee_id', employeeId)
    .eq('year', year)
  if (error) throw new Error(`getEmployeeLeaveBalances: ${error.message}`)
  return (data ?? []).map((r: any) => ({
    ...r,
    opening_balance: Number(r.opening_balance ?? 0),
    accrued:         Number(r.accrued ?? 0),
    used:            Number(r.used ?? 0),
    available:       Number(r.available ?? 0),
  })) as LeaveBalanceWithRefs[]
}
