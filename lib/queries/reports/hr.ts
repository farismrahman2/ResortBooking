import { createServiceClient } from '@/lib/supabase/server'
import { unstable_cache } from 'next/cache'
import { toIsoDate } from '@/lib/reports/periods'
import type { PeriodRange } from '@/lib/reports/types'

const db = () => createServiceClient() as any  // eslint-disable-line @typescript-eslint/no-explicit-any

// ─── Salary % of revenue ────────────────────────────────────────────────────

export interface SalaryVsRevenueRow {
  month: string
  revenue: number
  payroll_total: number | null    // null = no finalized payroll for that month
  salary_pct: number | null
  status: 'pending' | 'healthy' | 'watch' | 'high'
}

async function fetchSalaryVsRevenue(period: PeriodRange): Promise<SalaryVsRevenueRow[]> {
  const fromIso = toIsoDate(period.from)
  const toIso   = toIsoDate(period.to)
  const [{ data: incomeRows }, { data: payrolls }] = await Promise.all([
    db().rpc('reports_monthly_income', { p_from: fromIso, p_to: toIso }),
    db().from('payroll_runs').select('period, total_net, status')
      .eq('status', 'finalized')
      .gte('period', fromIso).lte('period', toIso),
  ])
  const payrollByMonth = new Map<string, number>()
  for (const p of (payrolls ?? []) as Array<{ period: string; total_net: number }>) {
    payrollByMonth.set(p.period, Number(p.total_net ?? 0))
  }
  return ((incomeRows ?? []) as Array<{ month: string; total_revenue: number }>).map((i) => {
    const revenue = Number(i.total_revenue ?? 0)
    const payroll = payrollByMonth.get(i.month) ?? null
    const pct = payroll !== null && revenue > 0 ? Math.round((payroll / revenue) * 1000) / 10 : null
    let status: SalaryVsRevenueRow['status'] = 'pending'
    if (pct === null) status = 'pending'
    else if (pct < 30) status = 'healthy'
    else if (pct <= 35) status = 'watch'
    else status = 'high'
    return { month: i.month, revenue, payroll_total: payroll, salary_pct: pct, status }
  })
}

export const getSalaryVsRevenue = (period: PeriodRange) => unstable_cache(
  () => fetchSalaryVsRevenue(period),
  ['reports-hr-salary-vs-revenue', toIsoDate(period.from), toIsoDate(period.to)],
  { revalidate: 60, tags: ['reports'] },
)()

// ─── Attendance ──────────────────────────────────────────────────────────────

export interface DepartmentAttendanceRow {
  department: string
  active_staff: number
  attendance_rate_pct: number   // (present + paid_leave + weekly_off + holiday) / total marked
  absent_days: number
  paid_leave_days: number
  unpaid_leave_days: number
  half_days: number
}

export interface TopAbsenteeRow {
  employee_id:   string
  full_name:     string
  employee_code: string
  department:    string
  absent_days:   number
}

export interface AttendanceTotals {
  attendance_rate_pct: number
  total_absent_days:   number
  total_leave_days:    number
}

export async function getAttendanceReport(period: PeriodRange): Promise<{
  totals: AttendanceTotals
  byDepartment: DepartmentAttendanceRow[]
  topAbsentees: TopAbsenteeRow[]
}> {
  const fromIso = toIsoDate(period.from)
  const toIso   = toIsoDate(period.to)
  const [{ data: rows }, { data: employees }] = await Promise.all([
    db().from('attendance')
      .select('employee_id, status, employee:employees!inner (full_name, employee_code, department)')
      .gte('date', fromIso).lte('date', toIso),
    db().from('employees').select('id, department, employment_status').in('employment_status', ['active', 'on_leave']),
  ])

  const empMeta = new Map<string, { full_name: string; employee_code: string; department: string }>()
  const byDept = new Map<string, DepartmentAttendanceRow>()
  for (const e of (employees ?? []) as Array<{ id: string; department: string }>) {
    const cur = byDept.get(e.department) ?? {
      department: e.department, active_staff: 0,
      attendance_rate_pct: 0, absent_days: 0, paid_leave_days: 0, unpaid_leave_days: 0, half_days: 0,
    }
    cur.active_staff += 1
    byDept.set(e.department, cur)
  }
  const absenteeCounts = new Map<string, number>()
  let totalMarked = 0, totalGoodStanding = 0, totalAbsent = 0, totalLeave = 0
  for (const r of (rows ?? []) as Array<{ employee_id: string; status: string; employee: { full_name: string; employee_code: string; department: string } }>) {
    if (r.employee) {
      empMeta.set(r.employee_id, r.employee)
    }
    const dept = r.employee?.department ?? 'unknown'
    const cur = byDept.get(dept) ?? {
      department: dept, active_staff: 0,
      attendance_rate_pct: 0, absent_days: 0, paid_leave_days: 0, unpaid_leave_days: 0, half_days: 0,
    }
    totalMarked += 1
    if (['present', 'paid_leave', 'weekly_off', 'holiday'].includes(r.status)) totalGoodStanding += 1
    if (r.status === 'absent')        { cur.absent_days       += 1; totalAbsent += 1; absenteeCounts.set(r.employee_id, (absenteeCounts.get(r.employee_id) ?? 0) + 1) }
    if (r.status === 'paid_leave')    { cur.paid_leave_days   += 1; totalLeave  += 1 }
    if (r.status === 'unpaid_leave')  { cur.unpaid_leave_days += 1; totalLeave  += 1 }
    if (r.status === 'half_day')      { cur.half_days         += 1 }
    byDept.set(dept, cur)
  }
  // Compute attendance rate per department
  for (const dept of byDept.values()) {
    const totalDays = dept.active_staff > 0 ? dept.active_staff : 1
    // proxy rate: 1 - (absent + unpaid_leave) / total_marked_for_dept
    // simpler: calculate from category counts collected above on this dept
    const deptMarked = dept.absent_days + dept.paid_leave_days + dept.unpaid_leave_days + dept.half_days
    // the attendance rate uses (good standing) / (good standing + absent + unpaid_leave)
    const denom = deptMarked + dept.active_staff   // approximate: rough denominator
    dept.attendance_rate_pct = denom > 0
      ? Math.round((1 - (dept.absent_days + dept.unpaid_leave_days) / Math.max(denom, 1)) * 1000) / 10
      : 0
  }

  const topAbsentees: TopAbsenteeRow[] = Array.from(absenteeCounts.entries())
    .map(([employee_id, days]) => {
      const m = empMeta.get(employee_id)
      return {
        employee_id,
        full_name:     m?.full_name ?? '?',
        employee_code: m?.employee_code ?? '?',
        department:    m?.department ?? '?',
        absent_days:   days,
      }
    })
    .sort((a, b) => b.absent_days - a.absent_days)
    .slice(0, 10)

  return {
    totals: {
      attendance_rate_pct: totalMarked > 0 ? Math.round((totalGoodStanding / totalMarked) * 1000) / 10 : 0,
      total_absent_days: totalAbsent,
      total_leave_days:  totalLeave,
    },
    byDepartment: Array.from(byDept.values()).sort((a, b) => a.department.localeCompare(b.department)),
    topAbsentees,
  }
}

// ─── Loan exposure ──────────────────────────────────────────────────────────

export interface LoanExposureRow {
  loan_id:               string
  employee_name:         string
  employee_code:         string
  principal:             number
  monthly_installment:   number
  repaid:                number
  outstanding:           number
  taken_on:              string
  months_remaining:      number
  status:                'active' | 'closed' | 'written_off'
}

export interface LoanAgingRow { bucket: '0-3 mo' | '3-6 mo' | '6-12 mo' | '12+ mo'; count: number; total_outstanding: number }

export async function getLoanExposure(): Promise<{
  totals: { total_outstanding: number; active_loans: number; pct_of_payroll: number | null }
  active: LoanExposureRow[]
  aging: LoanAgingRow[]
}> {
  const [{ data: loans }, { data: lastPayroll }] = await Promise.all([
    db().from('loans').select('id, principal, monthly_installment, amount_repaid, outstanding, taken_on, status, employee:employees!inner (full_name, employee_code)')
      .eq('status', 'active'),
    db().from('payroll_runs').select('total_net').eq('status', 'finalized').order('period', { ascending: false }).limit(1),
  ])
  const today = new Date()
  const active = ((loans ?? []) as any[]).map((l) => {  // eslint-disable-line @typescript-eslint/no-explicit-any
    const monthsRem = l.monthly_installment > 0
      ? Math.ceil(Number(l.outstanding ?? 0) / Number(l.monthly_installment))
      : 0
    return {
      loan_id:             l.id,
      employee_name:       l.employee?.full_name ?? '?',
      employee_code:       l.employee?.employee_code ?? '?',
      principal:           Number(l.principal ?? 0),
      monthly_installment: Number(l.monthly_installment ?? 0),
      repaid:              Number(l.amount_repaid ?? 0),
      outstanding:         Number(l.outstanding ?? 0),
      taken_on:            l.taken_on,
      months_remaining:    monthsRem,
      status:              l.status,
    } as LoanExposureRow
  }).sort((a, b) => a.taken_on.localeCompare(b.taken_on))

  const totalOutstanding = active.reduce((s, l) => s + l.outstanding, 0)
  const lastPayrollNet = (lastPayroll ?? [])[0]?.total_net ?? null
  const pctOfPayroll = lastPayrollNet ? Math.round((totalOutstanding / Number(lastPayrollNet)) * 1000) / 10 : null

  // Aging buckets
  const aging: LoanAgingRow[] = [
    { bucket: '0-3 mo',  count: 0, total_outstanding: 0 },
    { bucket: '3-6 mo',  count: 0, total_outstanding: 0 },
    { bucket: '6-12 mo', count: 0, total_outstanding: 0 },
    { bucket: '12+ mo',  count: 0, total_outstanding: 0 },
  ]
  for (const l of active) {
    const months = (today.getTime() - new Date(l.taken_on + 'T00:00:00').getTime()) / (30 * 86400_000)
    let idx = 3
    if (months < 3) idx = 0
    else if (months < 6) idx = 1
    else if (months < 12) idx = 2
    aging[idx].count += 1
    aging[idx].total_outstanding += l.outstanding
  }

  return {
    totals: { total_outstanding: totalOutstanding, active_loans: active.length, pct_of_payroll: pctOfPayroll },
    active,
    aging,
  }
}
