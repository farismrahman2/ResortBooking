import { z } from 'zod'

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')

// ── Attendance ───────────────────────────────────────────────────────────────
export const attendanceStatusSchema = z.enum([
  'present', 'absent', 'paid_leave', 'unpaid_leave',
  'weekly_off', 'holiday', 'half_day',
])

export const markAttendanceSchema = z.object({
  employee_id:   z.string().uuid(),
  date:          isoDate,
  status:        attendanceStatusSchema,
  leave_type_id: z.string().uuid().nullable().optional(),
  notes:         z.string().trim().max(500).nullable().optional(),
})
export type MarkAttendanceInput = z.infer<typeof markAttendanceSchema>

export const bulkMarkAttendanceSchema = z.object({
  date:    isoDate,
  entries: z.array(z.object({
    employee_id:   z.string().uuid(),
    status:        attendanceStatusSchema,
    leave_type_id: z.string().uuid().nullable().optional(),
    notes:         z.string().trim().max(500).nullable().optional(),
  })).min(1, 'At least one entry'),
})
export type BulkMarkAttendanceInput = z.infer<typeof bulkMarkAttendanceSchema>

// ── Loans ────────────────────────────────────────────────────────────────────
export const loanFormSchema = z.object({
  employee_id:         z.string().uuid('Pick an employee'),
  principal:           z.coerce.number().positive(),
  monthly_installment: z.coerce.number().positive(),
  taken_on:            isoDate,
  repayment_starts:    isoDate,
  notes:               z.string().trim().max(500).nullable().optional().or(z.literal('')),
}).refine((v) => v.monthly_installment <= v.principal, {
  message: 'Monthly installment cannot exceed principal',
  path:    ['monthly_installment'],
})
export type LoanFormInput = z.infer<typeof loanFormSchema>

// ── Salary adjustments ───────────────────────────────────────────────────────
export const salaryAdjustmentTypeSchema = z.enum([
  'fine', 'bonus', 'eid_bonus', 'advance',
  'other_addition', 'other_deduction',
  // 'loan_repayment' is system-generated; not user-creatable.
])

export const adjustmentFormSchema = z.object({
  employee_id:       z.string().uuid(),
  applies_to_month:  isoDate,                      // YYYY-MM-01
  type:              salaryAdjustmentTypeSchema,
  amount:            z.coerce.number().positive(),
  description:       z.string().trim().max(500).nullable().optional().or(z.literal('')),
})
export type AdjustmentFormInput = z.infer<typeof adjustmentFormSchema>

// ── Leave types (admin) ──────────────────────────────────────────────────────
export const leaveTypeFormSchema = z.object({
  name: z.string().trim().min(2).max(60),
  slug: z.string().trim().regex(/^[a-z0-9_]+$/, 'lowercase letters, digits, underscore only').min(2).max(40),
  default_annual_balance: z.coerce.number().min(0).max(365),
  is_paid:       z.coerce.boolean().default(true),
  display_order: z.coerce.number().int().min(0).default(0),
  is_active:     z.coerce.boolean().default(true),
})
export type LeaveTypeFormInput = z.infer<typeof leaveTypeFormSchema>

// ── Service charge ───────────────────────────────────────────────────────────
export const serviceChargeFormSchema = z.object({
  employee_id:       z.string().uuid(),
  applies_to_month:  isoDate,
  amount:            z.coerce.number().min(0),
  notes:             z.string().trim().max(500).nullable().optional().or(z.literal('')),
})
export type ServiceChargeFormInput = z.infer<typeof serviceChargeFormSchema>
