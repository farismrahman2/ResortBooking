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

// ─── Movements (Phase 2) ──────────────────────────────────────────────────────

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date')

const baseLine = z.object({
  item_id:    z.string().uuid('Item required'),
  quantity:   z.number().positive('Quantity must be > 0'),
  notes:      z.string().trim().min(1).nullable().optional(),
})

export const receiptFormSchema = z.object({
  movement_date:  isoDate,
  store_id:       z.string().uuid('Store required'),
  supplier_id:    z.string().uuid('Supplier required'),
  invoice_number: z.string().trim().min(1).nullable().optional(),
  invoice_date:   isoDate.nullable().optional(),
  notes:          z.string().trim().min(1).nullable().optional(),
  lines: z.array(baseLine.extend({
    unit_price: z.number().min(0, 'Unit price must be ≥ 0'),
  })).min(1, 'At least one line required'),
})

export const issueFormSchema = z.object({
  movement_date:        isoDate,
  store_id:             z.string().uuid('Store required'),
  issued_to_department: z.string().trim().min(1, 'Department required'),
  notes:                z.string().trim().min(1).nullable().optional(),
  lines:                z.array(baseLine).min(1, 'At least one line required'),
})

export const transferFormSchema = z.object({
  movement_date:        isoDate,
  store_id:             z.string().uuid('Origin store required'),
  transfer_to_store_id: z.string().uuid('Destination store required'),
  notes:                z.string().trim().min(1).nullable().optional(),
  lines:                z.array(baseLine).min(1, 'At least one line required'),
}).refine((v) => v.store_id !== v.transfer_to_store_id, {
  message: 'Destination must differ from origin', path: ['transfer_to_store_id'],
})

export const adjustmentFormSchema = z.object({
  movement_date:     isoDate,
  store_id:          z.string().uuid('Store required'),
  adjustment_reason: z.enum(['breakage', 'expired', 'theft', 'loss', 'recount', 'damage', 'other']),
  notes:             z.string().trim().min(1).nullable().optional(),
  lines: z.array(baseLine.extend({
    adjustment_direction: z.enum(['increase', 'decrease']),
  })).min(1, 'At least one line required'),
})

export type ReceiptFormInput    = z.input<typeof receiptFormSchema>
export type IssueFormInput      = z.input<typeof issueFormSchema>
export type TransferFormInput   = z.input<typeof transferFormSchema>
export type AdjustmentFormInput = z.input<typeof adjustmentFormSchema>
