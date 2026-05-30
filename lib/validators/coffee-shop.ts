import { z } from 'zod'

export const coffeeShopPaymentMethodSchema = z.enum([
  'cash', 'bkash', 'card', 'bank_transfer', 'other',
])

export const coffeeShopSaleItemSchema = z.object({
  charge_item_id:     z.string().uuid().nullable().optional(),
  category_id:        z.string().uuid('Category required'),
  description:        z.string().min(1, 'Description required'),
  quantity:           z.number().positive('Quantity must be > 0'),
  unit_price:         z.number().min(0, 'Unit price must be ≥ 0'),
  is_complimentary:   z.boolean().default(false),
  comp_authorized_by: z.string().nullable().optional(),  // 'self' sentinel or UUID; action resolves
  comp_reason:        z.string().nullable().optional(),
  notes:              z.string().nullable().optional(),
}).refine(
  (item) => !item.is_complimentary || (!!item.comp_authorized_by && !!item.comp_reason),
  { message: 'Comp items require authorizer + reason', path: ['comp_reason'] },
)

export const coffeeShopPaymentSchema = z.object({
  amount:    z.number().positive('Amount must be > 0'),
  method:    coffeeShopPaymentMethodSchema,
  reference: z.string().nullable().optional(),
})

export const coffeeShopSaleFormSchema = z.object({
  sale_date:        z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date'),
  customer_label:   z.string().nullable().optional(),
  notes:            z.string().nullable().optional(),
  items:            z.array(coffeeShopSaleItemSchema).min(1, 'At least one item required'),
  discount_type:    z.enum(['percent', 'fixed']).nullable().optional(),
  discount_value:   z.number().min(0).nullable().optional(),
  discount_reason:  z.string().nullable().optional(),
  payments:         z.array(coffeeShopPaymentSchema).min(1, 'At least one payment required'),
})

export type CoffeeShopSaleFormInput = z.input<typeof coffeeShopSaleFormSchema>
export type CoffeeShopSaleItemInput = z.input<typeof coffeeShopSaleItemSchema>
export type CoffeeShopPaymentInput  = z.input<typeof coffeeShopPaymentSchema>
