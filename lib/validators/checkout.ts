import { z } from 'zod'

// ── Charge catalog admin ────────────────────────────────────────────────────
export const chargeCategoryFormSchema = z.object({
  slug: z.string().trim().regex(/^[a-z0-9_]+$/, 'lowercase letters, digits, underscore').min(2).max(40),
  display_name:  z.string().trim().min(2).max(80),
  display_order: z.coerce.number().int().min(0).default(0),
  is_active:     z.coerce.boolean().default(true),
})
export type ChargeCategoryFormInput = z.infer<typeof chargeCategoryFormSchema>

export const chargeItemFormSchema = z.object({
  category_id:   z.string().uuid('Pick a category'),
  name:          z.string().trim().min(2).max(120),
  default_price: z.coerce.number().min(0).max(99_999_999),
  description:   z.string().trim().max(500).nullable().optional().or(z.literal('')),
  display_order: z.coerce.number().int().min(0).default(0),
  is_active:     z.coerce.boolean().default(true),
})
export type ChargeItemFormInput = z.infer<typeof chargeItemFormSchema>

// ── Add charge during stay or at checkout ────────────────────────────────────
export const addChargeSchema = z.object({
  booking_id:     z.string().uuid(),
  category_id:    z.string().uuid('Pick a category'),
  charge_item_id: z.string().uuid().nullable().optional(),
  description:    z.string().trim().min(1).max(200),
  quantity:       z.coerce.number().positive().max(9999),
  unit_price:     z.coerce.number().min(0).max(99_999_999),
  notes:          z.string().trim().max(500).nullable().optional().or(z.literal('')),
})
export type AddChargeInput = z.infer<typeof addChargeSchema>

export const updateChargeSchema = z.object({
  description: z.string().trim().min(1).max(200),
  quantity:    z.coerce.number().positive().max(9999),
  unit_price:  z.coerce.number().min(0).max(99_999_999),
  notes:       z.string().trim().max(500).nullable().optional().or(z.literal('')),
})
export type UpdateChargeInput = z.infer<typeof updateChargeSchema>

// ── Payment ─────────────────────────────────────────────────────────────────
export const paymentMethodSchema = z.enum([
  'cash','bkash','nagad','rocket','card','bank_transfer','other',
])

export const addPaymentSchema = z.object({
  amount:    z.coerce.number().positive().max(99_999_999),
  method:    paymentMethodSchema,
  reference: z.string().trim().max(120).nullable().optional().or(z.literal('')),
  notes:     z.string().trim().max(500).nullable().optional().or(z.literal('')),
})
export type AddPaymentInput = z.infer<typeof addPaymentSchema>

// ── Refund ──────────────────────────────────────────────────────────────────
export const recordRefundSchema = z.object({
  amount:    z.coerce.number().positive().max(99_999_999),
  method:    paymentMethodSchema.default('cash'),
  reference: z.string().trim().max(120).nullable().optional().or(z.literal('')),
})
export type RecordRefundInput = z.infer<typeof recordRefundSchema>

// ── Void ────────────────────────────────────────────────────────────────────
export const voidCheckoutSchema = z.object({
  reason: z.string().trim().min(2, 'Reason is required').max(500),
})
export type VoidCheckoutInput = z.infer<typeof voidCheckoutSchema>

// ── Discount ────────────────────────────────────────────────────────────────
export const applyDiscountSchema = z.object({
  /** 'fixed' uses the amount as-is; 'percent' multiplies subtotal. */
  mode:    z.enum(['fixed', 'percent']),
  value:   z.coerce.number().min(0),
  reason:  z.string().trim().min(2, 'Reason is required').max(500),
}).superRefine((v, ctx) => {
  if (v.mode === 'percent' && v.value > 100) {
    ctx.addIssue({ code: 'custom', message: 'Percent must be 0–100', path: ['value'] })
  }
})
export type ApplyDiscountInput = z.infer<typeof applyDiscountSchema>
