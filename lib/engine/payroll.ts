import type {
  AttendanceStatus,
  LoanRow,
  SalaryStructureRow,
  SalaryAdjustmentRow,
} from '@/lib/supabase/types'
import { addAdjustment, emptyAdjustmentSums, type AdjustmentSums } from '@/lib/queries/salary-adjustments'

/**
 * PAYROLL ENGINE — pure functions, no DB access.
 *
 * Computes a single employee's payroll line for a given month from:
 *   - current salary structure (gross + per-component breakdown)
 *   - attendance summary (counts by status)
 *   - month-scoped salary adjustments
 *   - active loans → auto-generated loan_repayment lines
 *   - service-charge payout amount
 *
 * Unpaid-day deduction formula:
 *   unpaid_deduction = round( basic ÷ days_in_month × days_unpaid_leave )
 *
 * `days_absent` is treated as unpaid for v1 (no separate "lost-pay" toggle).
 * `weekly_off` and `holiday` are paid (no deduction).
 *
 * Rounding: all amounts are rounded to 2 decimals at the end via Math.round(x * 100) / 100.
 */

export interface AttendanceCounts {
  days_present:      number
  days_absent:       number
  days_paid_leave:   number
  days_unpaid_leave: number
  days_weekly_off:   number
  days_holiday:      number
  days_half_day:     number
  total_marked:      number
}

export interface PayrollLine {
  employee_id:       string
  basic:             number
  house_rent:        number
  medical:           number
  transport:         number
  mobile:            number
  other_allowance:   number
  gross:             number
  days_in_month:     number
  days_present:      number
  days_absent:       number
  days_paid_leave:   number
  days_unpaid_leave: number
  days_weekly_off:   number
  days_holiday:      number
  unpaid_deduction:  number
  bonuses:           number
  eid_bonus:         number
  other_additions:   number
  fines:             number
  advance_deduction: number
  loan_deduction:    number
  other_deductions:  number
  service_charge:    number
  net_pay:           number
  /** Per-loan breakdown — used at finalize time to insert loan_repayment adjustments */
  loan_breakdown:    Array<{ loan_id: string; amount: number }>
}

function r2(n: number): number {
  return Math.round(n * 100) / 100
}

export function daysInMonth(monthIso: string): number {
  const m = monthIso.match(/^(\d{4})-(\d{2})/)
  if (!m) return 30
  return new Date(Number(m[1]), Number(m[2]), 0).getDate()
}

/**
 * Computes the loan repayment for this period given the active loans.
 * Each loan contributes min(monthly_installment, outstanding) — never more
 * than the remaining balance. Loans whose `repayment_starts` is later than
 * the period are skipped.
 */
export function computeLoanRepayments(
  loans: LoanRow[],
  monthIso: string,    // YYYY-MM-01
): Array<{ loan_id: string; amount: number }> {
  const result: Array<{ loan_id: string; amount: number }> = []
  for (const l of loans) {
    if (l.status !== 'active') continue
    if (l.repayment_starts > monthIso) continue
    if (Number(l.outstanding) <= 0)    continue
    const due = Math.min(Number(l.monthly_installment), Number(l.outstanding))
    if (due > 0) result.push({ loan_id: l.id, amount: r2(due) })
  }
  return result
}

export function computePayrollLine(args: {
  employeeId:    string
  monthIso:      string                       // YYYY-MM-01
  salary:        SalaryStructureRow
  attendance:    AttendanceCounts
  adjustments:   SalaryAdjustmentRow[]        // user-entered for the month
  loans:         LoanRow[]                    // active loans for the employee
  serviceCharge: number
}): PayrollLine {
  const dim = daysInMonth(args.monthIso)
  const basic = Number(args.salary.basic)

  // Half-day = ½ unpaid day for v1 simplicity.
  const unpaidDays = args.attendance.days_unpaid_leave
                   + args.attendance.days_absent
                   + (args.attendance.days_half_day * 0.5)

  const unpaidDeduction = r2((basic / dim) * unpaidDays)

  // Sum user-entered adjustments by type
  const sums: AdjustmentSums = emptyAdjustmentSums()
  for (const a of args.adjustments) addAdjustment(sums, a.type, Number(a.amount))

  // Add the auto-loan-repayments to loan_deduction
  const loanBreakdown = computeLoanRepayments(args.loans, args.monthIso)
  const autoLoan = loanBreakdown.reduce((s, x) => s + x.amount, 0)
  sums.loan_deduction = r2(sums.loan_deduction + autoLoan)

  const additions = sums.bonuses + sums.eid_bonus + sums.other_additions
  const deductions = unpaidDeduction
                   + sums.fines
                   + sums.advance_deduction
                   + sums.loan_deduction
                   + sums.other_deductions

  const gross = Number(args.salary.gross)
  const net   = r2(gross + additions + Number(args.serviceCharge ?? 0) - deductions)

  return {
    employee_id:       args.employeeId,
    basic:             basic,
    house_rent:        Number(args.salary.house_rent),
    medical:           Number(args.salary.medical),
    transport:         Number(args.salary.transport),
    mobile:            Number(args.salary.mobile),
    other_allowance:   Number(args.salary.other_allowance),
    gross,
    days_in_month:     dim,
    days_present:      args.attendance.days_present,
    days_absent:       args.attendance.days_absent,
    days_paid_leave:   args.attendance.days_paid_leave,
    days_unpaid_leave: args.attendance.days_unpaid_leave,
    days_weekly_off:   args.attendance.days_weekly_off,
    days_holiday:      args.attendance.days_holiday,
    unpaid_deduction:  unpaidDeduction,
    bonuses:           r2(sums.bonuses),
    eid_bonus:         r2(sums.eid_bonus),
    other_additions:   r2(sums.other_additions),
    fines:             r2(sums.fines),
    advance_deduction: r2(sums.advance_deduction),
    loan_deduction:    r2(sums.loan_deduction),
    other_deductions:  r2(sums.other_deductions),
    service_charge:    r2(Number(args.serviceCharge ?? 0)),
    net_pay:           net,
    loan_breakdown:    loanBreakdown,
  }
}
