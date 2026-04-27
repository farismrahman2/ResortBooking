import { createClient } from '@/lib/supabase/server'
import type {
  EmployeeRow,
  EmployeeWithCurrentSalary,
  SalaryStructureRow,
  EmploymentStatus,
  Department,
} from '@/lib/supabase/types'

/**
 * EMPLOYEE QUERIES (server-only)
 *
 * Mirrors `lib/queries/expenses.ts` patterns: `db = supabase as any`,
 * NUMERIC strings coerced to numbers, throw on error so the page can
 * render <MigrationErrorBanner>.
 */

interface GetEmployeesParams {
  status?:        EmploymentStatus | 'any'
  department?:    Department | 'any'
  search?:        string
  includeTerminated?: boolean
  limit?:         number
}

function coerceSalary(r: any): SalaryStructureRow {
  return {
    ...r,
    basic:           Number(r.basic ?? 0),
    house_rent:      Number(r.house_rent ?? 0),
    medical:         Number(r.medical ?? 0),
    transport:       Number(r.transport ?? 0),
    mobile:          Number(r.mobile ?? 0),
    other_allowance: Number(r.other_allowance ?? 0),
    gross:           Number(r.gross ?? 0),
  }
}

export async function getEmployees(
  params: GetEmployeesParams = {},
): Promise<EmployeeWithCurrentSalary[]> {
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  // Pull with the currently-effective salary attached. We embed the salary_structures
  // table as `current_salary`, then filter the embed to effective_to IS NULL.
  let query = db
    .from('employees')
    .select(`
      *,
      current_salary:salary_structures!salary_structures_employee_id_fkey (
        id, employee_id, effective_from, effective_to,
        basic, house_rent, medical, transport, mobile, other_allowance, gross,
        notes, created_at
      )
    `)
    .order('full_name', { ascending: true })
    .limit(params.limit ?? 100)

  if (!params.includeTerminated && params.status === undefined) {
    query = query.in('employment_status', ['active', 'on_leave'])
  } else if (params.status && params.status !== 'any') {
    query = query.eq('employment_status', params.status)
  }
  if (params.department && params.department !== 'any') {
    query = query.eq('department', params.department)
  }
  if (params.search) {
    const s = params.search.replace(/[%]/g, '')
    query = query.or(
      `full_name.ilike.%${s}%,employee_code.ilike.%${s}%,phone.ilike.%${s}%,designation.ilike.%${s}%`,
    )
  }

  const { data, error } = await query
  if (error) throw new Error(`getEmployees: ${error.message}`)

  return (data ?? []).map((r: any) => {
    const currentList = (r.current_salary ?? []).filter((s: any) => s.effective_to === null)
    const current = currentList.length > 0 ? coerceSalary(currentList[0]) : null
    return { ...r, current_salary: current }
  })
}

export async function getEmployeeById(
  id: string,
): Promise<EmployeeWithCurrentSalary | null> {
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  const { data, error } = await db
    .from('employees')
    .select(`
      *,
      current_salary:salary_structures!salary_structures_employee_id_fkey (
        id, employee_id, effective_from, effective_to,
        basic, house_rent, medical, transport, mobile, other_allowance, gross,
        notes, created_at
      )
    `)
    .eq('id', id)
    .single()

  if (error || !data) return null
  const currentList = (data.current_salary ?? []).filter((s: any) => s.effective_to === null)
  const current = currentList.length > 0 ? coerceSalary(currentList[0]) : null
  return { ...data, current_salary: current }
}

export async function getCurrentSalary(
  employeeId: string,
): Promise<SalaryStructureRow | null> {
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any
  const { data } = await db
    .from('salary_structures')
    .select('*')
    .eq('employee_id', employeeId)
    .is('effective_to', null)
    .order('effective_from', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data ? coerceSalary(data) : null
}

export async function getSalaryHistory(
  employeeId: string,
): Promise<SalaryStructureRow[]> {
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any
  const { data, error } = await db
    .from('salary_structures')
    .select('*')
    .eq('employee_id', employeeId)
    .order('effective_from', { ascending: false })
  if (error) throw new Error(`getSalaryHistory: ${error.message}`)
  return (data ?? []).map((r: any) => coerceSalary(r))
}

export async function getEmployeeStats(): Promise<{
  active:     number
  on_leave:   number
  terminated: number
  resigned:   number
}> {
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any
  const { data } = await db.from('employees').select('employment_status')
  const counts = { active: 0, on_leave: 0, terminated: 0, resigned: 0 }
  for (const r of (data ?? []) as { employment_status: keyof typeof counts }[]) {
    if (r.employment_status in counts) counts[r.employment_status] += 1
  }
  return counts
}

/**
 * Generates the next sequential employee code (`GCR-001`, `GCR-002`, ...).
 * Counts existing rows + 1 — admin can override in the form.
 */
export async function suggestEmployeeCode(): Promise<string> {
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any
  const { count } = await db
    .from('employees')
    .select('id', { count: 'exact', head: true })
  const next = (count ?? 0) + 1
  return `GCR-${String(next).padStart(3, '0')}`
}

// Pure helper used by Phase 2 employee profile UI — kept here so it's reusable in queries.
export function netSalaryGuess(s: SalaryStructureRow | null): number {
  if (!s) return 0
  return Number(s.gross)
}

export function _coerceEmployeeRow(r: any): EmployeeRow { return r as EmployeeRow }
