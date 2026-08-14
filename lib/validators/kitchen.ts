import { z } from 'zod'

const nullableStr = z.string().trim().max(500).nullish().transform((v) => v || null)

/**
 * A line as it exists WHILE TYPING. Deliberately permissive: adding an item
 * puts a row on screen before any quantity is entered, and the autosave fires
 * a moment later. Requiring qty > 0 here rejected the entire requisition on
 * every save until every single line had a number in it.
 *
 * saveRequisition drops qty <= 0 rows before writing, so a blank line simply
 * doesn't persist. The real check happens at submit.
 */
export const requisitionLineSchema = z.object({
  id:                z.string().uuid().optional(),
  sort_order:        z.number().int().min(0).default(0),
  item_id:           z.string().uuid().nullish().transform((v) => v || null),
  item_name:         z.string().trim().max(200).default(''),
  kitchen_vendor_id: z.string().uuid().nullish().transform((v) => v || null),
  qty:               z.coerce.number().min(0).catch(0).default(0),
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
}).superRefine((data, ctx) => {
  // Only persisted lines reach here, and those already have qty > 0 — but
  // check anyway so a future caller can't slip a zero-quantity order past.
  const bad = (data.lines ?? []).find((l) => !(Number(l.qty) > 0))
  if (bad) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom, path: ['lines'],
      message: `"${bad.item_name || 'An item'}" has no quantity`,
    })
  }
})

export const approveSchema = z.object({
  approved_by_employee_id: z.string().uuid('Choose who is approving this'),
  approval_notes:          nullableStr,
})

export const vendorSchema = z.object({
  display_name: z.string().trim().min(1, 'Name is required').max(60),
  /** Stable key used by code and by the seed. Generated from the name on
   *  create, and NOT editable afterwards — renaming a slug would orphan any
   *  item already pointing at it. */
  slug:         z.string().trim().regex(/^[a-z0-9_]+$/, 'Lowercase letters, numbers and underscores only').optional(),
  sort_order:   z.coerce.number().int().min(0).default(0),
  is_active:    z.boolean().default(true),
})
