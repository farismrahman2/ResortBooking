import type {
  Department,
  EmploymentStatus,
  AttendanceStatus,
  Gender,
  SalaryAdjustmentType,
  LoanStatus,
  PayrollRunStatus,
} from '@/lib/supabase/types'

export const DEPARTMENT_LABELS: Record<Department, string> = {
  management:  'Management',
  frontdesk:   'Front Desk',
  housekeeping:'Housekeeping',
  kitchen:     'Kitchen',
  f_and_b:     'Food & Beverage',
  security:    'Security',
  maintenance: 'Maintenance',
  gardener:    'Gardener',
  accounts:    'Accounts',
  other:       'Other',
}

export const DEPARTMENT_OPTIONS: { value: Department; label: string }[] = (
  ['management','frontdesk','housekeeping','kitchen','f_and_b',
   'security','maintenance','gardener','accounts','other'] as Department[]
).map((d) => ({ value: d, label: DEPARTMENT_LABELS[d] }))

export const EMPLOYMENT_STATUS_LABELS: Record<EmploymentStatus, string> = {
  active:     'Active',
  on_leave:   'On Leave',
  terminated: 'Terminated',
  resigned:   'Resigned',
}

export const EMPLOYMENT_STATUS_BADGE: Record<EmploymentStatus, string> = {
  active:     'bg-emerald-50 text-emerald-700 border-emerald-200',
  on_leave:   'bg-amber-50 text-amber-700 border-amber-200',
  terminated: 'bg-red-50 text-red-700 border-red-200',
  resigned:   'bg-gray-100 text-gray-700 border-gray-200',
}

export const GENDER_LABELS: Record<Gender, string> = {
  male:   'Male',
  female: 'Female',
  other:  'Other',
}
export const GENDER_OPTIONS: { value: Gender; label: string }[] = (
  ['male','female','other'] as Gender[]
).map((g) => ({ value: g, label: GENDER_LABELS[g] }))

export const ATTENDANCE_STATUS_LABELS: Record<AttendanceStatus, string> = {
  present:      'Present',
  absent:       'Absent',
  paid_leave:   'Paid Leave',
  unpaid_leave: 'Unpaid Leave',
  weekly_off:   'Weekly Off',
  holiday:      'Holiday',
  half_day:     'Half Day',
}

export const ATTENDANCE_STATUS_BADGE: Record<AttendanceStatus, string> = {
  present:      'bg-emerald-50 text-emerald-700 border-emerald-200',
  absent:       'bg-red-50 text-red-700 border-red-200',
  paid_leave:   'bg-sky-50 text-sky-700 border-sky-200',
  unpaid_leave: 'bg-amber-50 text-amber-700 border-amber-200',
  weekly_off:   'bg-gray-100 text-gray-600 border-gray-200',
  holiday:      'bg-indigo-50 text-indigo-700 border-indigo-200',
  half_day:     'bg-purple-50 text-purple-700 border-purple-200',
}

export const SALARY_ADJUSTMENT_LABELS: Record<SalaryAdjustmentType, string> = {
  fine:            'Fine',
  bonus:           'Bonus',
  eid_bonus:       'Eid Bonus',
  advance:         'Advance',
  loan_repayment:  'Loan Repayment',
  other_addition:  'Other Addition',
  other_deduction: 'Other Deduction',
}

export const SALARY_ADJUSTMENT_OPTIONS: { value: SalaryAdjustmentType; label: string }[] = (
  ['bonus','eid_bonus','other_addition','fine','advance','other_deduction'] as SalaryAdjustmentType[]
).map((t) => ({ value: t, label: SALARY_ADJUSTMENT_LABELS[t] }))

/**
 * Whether an adjustment type is added to or deducted from net pay.
 * `loan_repayment` is system-generated, never user-entered.
 */
export const ADDITION_TYPES: SalaryAdjustmentType[] = ['bonus', 'eid_bonus', 'other_addition']
export const DEDUCTION_TYPES: SalaryAdjustmentType[] = [
  'fine', 'advance', 'loan_repayment', 'other_deduction',
]

export const LOAN_STATUS_LABELS: Record<LoanStatus, string> = {
  active:      'Active',
  closed:      'Closed',
  written_off: 'Written Off',
}
export const LOAN_STATUS_BADGE: Record<LoanStatus, string> = {
  active:      'bg-sky-50 text-sky-700 border-sky-200',
  closed:      'bg-emerald-50 text-emerald-700 border-emerald-200',
  written_off: 'bg-gray-100 text-gray-600 border-gray-200',
}

export const PAYROLL_STATUS_LABELS: Record<PayrollRunStatus, string> = {
  draft:     'Draft (preview)',
  finalized: 'Finalized',
}
export const PAYROLL_STATUS_BADGE: Record<PayrollRunStatus, string> = {
  draft:     'bg-amber-50 text-amber-700 border-amber-200',
  finalized: 'bg-emerald-50 text-emerald-700 border-emerald-200',
}

/**
 * Format a `YYYY-MM-01` period date as `Apr 2026` for display.
 */
export function formatPeriod(periodIso: string): string {
  const d = new Date(periodIso + 'T00:00:00')
  return d.toLocaleString('en-US', { month: 'short', year: 'numeric' })
}
