import { createClient } from '@/lib/supabase/server'
import type {
  AttendanceRow,
  EmployeeRow,
  AttendanceStatus,
} from '@/lib/supabase/types'

/**
 * ATTENDANCE QUERIES (server-only)
 */

export async function getAttendanceForDate(
  date: string,
): Promise<AttendanceRow[]> {
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any
  const { data, error } = await db
    .from('attendance')
    .select('*')
    .eq('date', date)
  if (error) throw new Error(`getAttendanceForDate: ${error.message}`)
  return (data ?? []) as AttendanceRow[]
}

/**
 * Returns a map: employee_id → AttendanceRow for a given date. Convenient for
 * rendering the daily grid where you want O(1) lookup per row.
 */
export async function getAttendanceMapForDate(
  date: string,
): Promise<Record<string, AttendanceRow>> {
  const rows = await getAttendanceForDate(date)
  const map: Record<string, AttendanceRow> = {}
  for (const r of rows) map[r.employee_id] = r
  return map
}

export async function getAttendanceForMonth(
  employeeId: string,
  monthIso: string,   // YYYY-MM
): Promise<AttendanceRow[]> {
  const m = monthIso.match(/^(\d{4})-(\d{2})$/)
  if (!m) return []
  const start = `${m[1]}-${m[2]}-01`
  const lastDay = new Date(Number(m[1]), Number(m[2]), 0).getDate()
  const end = `${m[1]}-${m[2]}-${String(lastDay).padStart(2, '0')}`

  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any
  const { data, error } = await db
    .from('attendance')
    .select('*')
    .eq('employee_id', employeeId)
    .gte('date', start)
    .lte('date', end)
    .order('date', { ascending: true })
  if (error) throw new Error(`getAttendanceForMonth: ${error.message}`)
  return (data ?? []) as AttendanceRow[]
}

/**
 * Aggregates attendance counts per employee for a payroll period.
 * Returns one entry per employee with counts by status.
 */
export interface AttendanceSummary {
  employee_id: string
  days_present:      number
  days_absent:       number
  days_paid_leave:   number
  days_unpaid_leave: number
  days_weekly_off:   number
  days_holiday:      number
  days_half_day:     number
  total_marked:      number
}

export async function summariseAttendanceForMonth(
  monthIso: string,   // YYYY-MM
): Promise<Map<string, AttendanceSummary>> {
  const m = monthIso.match(/^(\d{4})-(\d{2})$/)
  if (!m) return new Map()
  const start = `${m[1]}-${m[2]}-01`
  const lastDay = new Date(Number(m[1]), Number(m[2]), 0).getDate()
  const end = `${m[1]}-${m[2]}-${String(lastDay).padStart(2, '0')}`

  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any
  const { data, error } = await db
    .from('attendance')
    .select('employee_id, status')
    .gte('date', start)
    .lte('date', end)
  if (error) throw new Error(`summariseAttendanceForMonth: ${error.message}`)

  const map = new Map<string, AttendanceSummary>()
  for (const r of (data ?? []) as { employee_id: string; status: AttendanceStatus }[]) {
    const s = map.get(r.employee_id) ?? {
      employee_id: r.employee_id,
      days_present: 0, days_absent: 0,
      days_paid_leave: 0, days_unpaid_leave: 0,
      days_weekly_off: 0, days_holiday: 0,
      days_half_day: 0, total_marked: 0,
    }
    s.total_marked += 1
    switch (r.status) {
      case 'present':      s.days_present      += 1; break
      case 'absent':       s.days_absent       += 1; break
      case 'paid_leave':   s.days_paid_leave   += 1; break
      case 'unpaid_leave': s.days_unpaid_leave += 1; break
      case 'weekly_off':   s.days_weekly_off   += 1; break
      case 'holiday':      s.days_holiday      += 1; break
      case 'half_day':     s.days_half_day     += 1; break
    }
    map.set(r.employee_id, s)
  }
  return map
}

export async function getActiveEmployeesForGrid(): Promise<Pick<EmployeeRow,
  'id' | 'employee_code' | 'full_name' | 'designation' | 'department' | 'is_live_in'>[]> {
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any
  const { data, error } = await db
    .from('employees')
    .select('id, employee_code, full_name, designation, department, is_live_in')
    .in('employment_status', ['active', 'on_leave'])
    .order('full_name', { ascending: true })
    .limit(100)
  if (error) throw new Error(`getActiveEmployeesForGrid: ${error.message}`)
  return data ?? []
}
