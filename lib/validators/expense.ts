import { z } from 'zod'

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')

export const paymentMethodSchema = z.enum([
  'cash', 'bkash', 'nagad', 'rocket', 'bank_transfer', 'cheque', 'other',
])

export const payeeTypeSchema = z.enum([
  'supplier', 'contractor', 'staff', 'utility', 'other',
])

export const expenseCategoryGroupSchema = z.enum([
  'bazar', 'beverages', 'utilities', 'maintenance',
  'salary', 'services', 'materials', 'miscellaneous',
])

// ── Single expense create / edit ─────────────────────────────────────────────
export const expenseFormSchema = z.object({
  expense_date:     isoDate,
  category_id:      z.string().uuid('Pick a category'),
  payee_id:         z.string().uuid().nullable().optional(),
  description:      z.string().trim().max(500).nullable().optional(),
  amount:           z.coerce.number().positive('Amount must be > 0').max(99_999_999),
  payment_method:   paymentMethodSchema.default('cash'),
  reference_number: z.string().trim().max(100).nullable().optional(),
  notes:            z.string().trim().max(1000).nullable().optional(),
})
export type ExpenseFormInput = z.infer<typeof expenseFormSchema>

// ── Bulk daily entry — one date, many lines ──────────────────────────────────
export const dailyExpenseLineSchema = z.object({
  category_id: z.string().uuid(),
  payee_id:    z.string().uuid().nullable().optional(),
  description: z.string().trim().max(500).nullable().optional(),
  amount:      z.coerce.number().positive(),
})
export type DailyExpenseLine = z.infer<typeof dailyExpenseLineSchema>

export const dailyExpenseBulkSchema = z.object({
  expense_date:   isoDate,
  payment_method: paymentMethodSchema.default('cash'),
  notes:          z.string().trim().max(1000).nullable().optional(),
  lines:          z.array(dailyExpenseLineSchema).min(1, 'Add at least one line'),
})
export type DailyExpenseBulkInput = z.infer<typeof dailyExpenseBulkSchema>

// ── Categories & payees ──────────────────────────────────────────────────────
export const categoryFormSchema = z.object({
  name:                 z.string().trim().min(2).max(100),
  slug:                 z.string().trim().regex(/^[a-z0-9_]+$/, 'lowercase letters, digits, underscore only').min(2).max(60),
  category_group:       expenseCategoryGroupSchema,
  requires_description: z.boolean().default(false),
  requires_payee:       z.boolean().default(false),
  is_active:            z.boolean().default(true),
  display_order:        z.coerce.number().int().min(0).default(0),
})
export type CategoryFormInput = z.infer<typeof categoryFormSchema>

export const payeeFormSchema = z.object({
  name:          z.string().trim().min(2).max(100),
  payee_type:    payeeTypeSchema,
  phone:         z.string().trim().max(30).nullable().optional(),
  notes:         z.string().trim().max(500).nullable().optional(),
  is_active:     z.boolean().default(true),
  display_order: z.coerce.number().int().min(0).default(0),
})
export type PayeeFormInput = z.infer<typeof payeeFormSchema>

// ── Budgets ──────────────────────────────────────────────────────────────────
export const budgetFormSchema = z.object({
  category_id:  z.string().uuid().nullable().optional(),
  period_type:  z.enum(['monthly', 'yearly']),
  period_start: isoDate,
  amount:       z.coerce.number().positive(),
  notes:        z.string().trim().max(500).nullable().optional(),
})
export type BudgetFormInput = z.infer<typeof budgetFormSchema>

// ── Recurring templates ──────────────────────────────────────────────────────
export const recurringTemplateFormSchema = z.object({
  name:                   z.string().trim().min(2).max(100),
  category_id:            z.string().uuid(),
  default_payee_id:       z.string().uuid().nullable().optional(),
  default_amount:         z.coerce.number().positive().nullable().optional(),
  default_description:    z.string().trim().max(500).nullable().optional(),
  default_payment_method: paymentMethodSchema.default('cash'),
  day_of_month:           z.coerce.number().int().min(1).max(28),
  is_active:              z.boolean().default(true),
  notes:                  z.string().trim().max(500).nullable().optional(),
})
export type RecurringTemplateFormInput = z.infer<typeof recurringTemplateFormSchema>
