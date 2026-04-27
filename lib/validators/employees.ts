import { z } from 'zod'

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')

export const departmentSchema = z.enum([
  'management', 'frontdesk', 'housekeeping', 'kitchen', 'f_and_b',
  'security',   'maintenance', 'gardener',   'accounts', 'other',
])

export const genderSchema = z.enum(['male', 'female', 'other'])

export const employmentStatusSchema = z.enum([
  'active', 'on_leave', 'terminated', 'resigned',
])

// ── Employee create / edit ───────────────────────────────────────────────────
export const employeeFormSchema = z.object({
  employee_code:   z.string().trim().min(2).max(40).optional().or(z.literal('')),
  full_name:       z.string().trim().min(2).max(120),
  photo_url:       z.string().trim().url().nullable().optional().or(z.literal('')),
  designation:     z.string().trim().min(2).max(120),
  department:      departmentSchema,
  nid_number:      z.string().trim().max(40).nullable().optional().or(z.literal('')),
  date_of_birth:   isoDate.nullable().optional().or(z.literal('')),
  gender:          genderSchema.nullable().optional().or(z.literal('')),
  blood_group:     z.string().trim().max(8).nullable().optional().or(z.literal('')),
  phone:           z.string().trim().min(5).max(30),
  email:           z.string().trim().email().nullable().optional().or(z.literal('')),
  present_address:   z.string().trim().max(500).nullable().optional().or(z.literal('')),
  permanent_address: z.string().trim().max(500).nullable().optional().or(z.literal('')),
  emergency_contact_name:     z.string().trim().max(120).nullable().optional().or(z.literal('')),
  emergency_contact_phone:    z.string().trim().max(30).nullable().optional().or(z.literal('')),
  emergency_contact_relation: z.string().trim().max(60).nullable().optional().or(z.literal('')),
  joining_date:    isoDate,
  is_live_in:      z.coerce.boolean().default(false),
  meal_allowance_in_kind: z.coerce.boolean().default(false),
  notes:           z.string().trim().max(2000).nullable().optional().or(z.literal('')),
})
export type EmployeeFormInput = z.infer<typeof employeeFormSchema>

// ── Salary structure ─────────────────────────────────────────────────────────
export const salaryStructureFormSchema = z.object({
  effective_from:  isoDate,
  basic:           z.coerce.number().min(0),
  house_rent:      z.coerce.number().min(0).default(0),
  medical:         z.coerce.number().min(0).default(0),
  transport:       z.coerce.number().min(0).default(0),
  mobile:          z.coerce.number().min(0).default(0),
  other_allowance: z.coerce.number().min(0).default(0),
  notes:           z.string().trim().max(500).nullable().optional().or(z.literal('')),
})
export type SalaryStructureFormInput = z.infer<typeof salaryStructureFormSchema>

// ── Termination ─────────────────────────────────────────────────────────────
export const terminationSchema = z.object({
  termination_date:   isoDate,
  termination_reason: z.string().trim().min(2).max(500),
  status:             z.enum(['terminated', 'resigned']).default('terminated'),
})
export type TerminationInput = z.infer<typeof terminationSchema>
