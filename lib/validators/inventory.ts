import { z } from 'zod'

const nullableStr = z.string().trim().min(1).nullable().optional()

export const itemFormSchema = z.object({
  sku_code:             z.string().trim().min(1).nullable().optional(),  // auto-generated if empty
  name:                 z.string().trim().min(1, 'Name required'),
  description:          nullableStr,
  store_id:             z.string().uuid('Store required'),
  category_id:          z.string().uuid('Category required'),
  unit_id:              z.string().uuid('Unit required'),
  item_type:            z.enum(['consumable', 'operating_equipment']).default('consumable'),
  par_level:            z.number().min(0).nullable().optional(),
  reorder_point:        z.number().min(0).nullable().optional(),
  default_supplier_id:  z.string().uuid().nullable().optional(),
  allow_negative_stock: z.boolean().default(false),
  notes:                nullableStr,
}).refine(
  (v) => v.reorder_point == null || v.par_level == null || v.reorder_point <= v.par_level,
  { message: 'Reorder point must be ≤ par level', path: ['reorder_point'] },
)

export const supplierFormSchema = z.object({
  name:             z.string().trim().min(1, 'Name required'),
  expense_payee_id: z.string().uuid().nullable().optional(),
  contact_phone:    nullableStr,
  contact_email:    z.string().trim().email('Invalid email').nullable().optional(),
  contact_address:  nullableStr,
  notes:            nullableStr,
})

export type ItemFormInput     = z.input<typeof itemFormSchema>
export type SupplierFormInput = z.input<typeof supplierFormSchema>
