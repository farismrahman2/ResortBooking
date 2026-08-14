import { z } from 'zod'

const nullableStr = z.string().trim().max(500).nullish().transform((v) => v || null)

export const requisitionLineSchema = z.object({
  id:                z.string().uuid().optional(),
  sort_order:        z.number().int().min(0).default(0),
  item_id:           z.string().uuid().nullish().transform((v) => v || null),
  item_name:         z.string().trim().min(1, 'Item name is required').max(200),
  kitchen_vendor_id: z.string().uuid().nullish().transform((v) => v || null),
  qty:               z.coerce.number().positive('Quantity must be more than zero'),
  piece_count:       z.coerce.number().min(0).nullish().transform((v) => (v ? v : null)),
  unit_id:           z.string().uuid().nullish().transform((v) => v || null),
  notes:             nullableStr,
  is_extra:          z.boolean().default(false),
})

/** Draft — permissive, so a half-written requisition always saves. */
export const requisitionDraftSchema = z.object({
  event_date:   z.string().nullish().transform((v) => v || null),
  notes:        nullableStr,
  is_emergency: z.boolean().default(false),
  parent_requisition_id: z.string().uuid().nullish().transform((v) => v || null),
  lines:        z.array(requisitionLineSchema).default([]),
}).partial()

/**
 * Submit for approval — the blocking validation. An event date and at least
 * one line are the minimum that makes a requisition dispatchable.
 */
export const requisitionSubmitSchema = z.object({
  event_date: z.string().min(1, 'Event date is required'),
  lines:      z.array(requisitionLineSchema).min(1, 'Add at least one item'),
})

export const approveSchema = z.object({
  approved_by_employee_id: z.string().uuid('Choose who is approving this'),
  approval_notes:          nullableStr,
})
