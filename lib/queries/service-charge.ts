import { createClient } from '@/lib/supabase/server'
import type { ServiceChargePayoutRow } from '@/lib/supabase/types'

export interface ServiceChargeWithEmployee extends ServiceChargePayoutRow {
  employee: { id: string; full_name: string; employee_code: string }
}

export async function getServiceChargesForMonth(
  monthIso: string,   // YYYY-MM-01
): Promise<ServiceChargeWithEmployee[]> {
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any
  const { data, error } = await db
    .from('service_charge_payouts')
    .select(`
      *,
      employee:employees!inner (id, full_name, employee_code, employment_status)
    `)
    .eq('applies_to_month', monthIso)
    .order('created_at', { ascending: false })
  if (error) throw new Error(`getServiceChargesForMonth: ${error.message}`)
  return (data ?? []).map((r: any) => ({ ...r, amount: Number(r.amount) })) as ServiceChargeWithEmployee[]
}

export async function getServiceChargeForEmployeeMonth(
  employeeId: string,
  monthIso: string,
): Promise<number> {
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any
  const { data } = await db
    .from('service_charge_payouts')
    .select('amount')
    .eq('employee_id', employeeId)
    .eq('applies_to_month', monthIso)
    .maybeSingle()
  return Number(data?.amount ?? 0)
}
