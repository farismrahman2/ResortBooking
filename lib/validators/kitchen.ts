import { z } from 'zod'

const nullableStr = z.string().trim().max(500).nullish().transform((v) => v || null)

/**
 * Notes get a pasted WhatsApp instruction from the manager, which is routinely
 * longer than 500 characters. Sharing the 500-cap made every autosave fail
 * from the moment the paste happened — and the message named no field, so the
 * only symptom was a save that would not stop erroring.
 */
const longNote = z.string().trim().max(2000).nullish().transform((v) => v || null)

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
  // Negative is legal ONLY on an amendment, where "-2 kg" cancels part of
  // an order already sent. submitRequisition enforces the sign against the
  // parent link, because the schema can't see whether this is an amendment.
  qty:               z.coerce.number().catch(0).default(0),
  piece_count:       z.coerce.number().min(0).nullish().transform((v) => (v ? v : null)),
  unit_id:           z.string().uuid().nullish().transform((v) => v || null),
  notes:             nullableStr,
  is_extra:          z.boolean().default(false),
})

/** Draft — permissive, so a half-written requisition always saves. */
export const requisitionDraftSchema = z.object({
  event_date:   z.string().nullish().transform((v) => v || null),
  notes:        longNote,
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
  const bad = (data.lines ?? []).find((l) => Number(l.qty) === 0)
  if (bad) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom, path: ['lines'],
      message: `"${bad.item_name || 'An item'}" has no quantity`,
    })
  }
})

/**
 * The extra rule for a plain requisition: quantities must be positive.
 *
 * Negatives are the amendment mechanism — "-2 kg beef" cancels part of an
 * order the supplier already has — and they are meaningless on a first order.
 * Kept out of requisitionSubmitSchema because the schema cannot see whether
 * the requisition has a parent; submitRequisition applies whichever fits.
 */
export const noNegativeLines = (lines: Array<{ qty: number; item_name: string }>): string | null => {
  const bad = lines.find((l) => Number(l.qty) < 0)
  return bad
    ? `"${bad.item_name}" has a negative quantity. Negatives are only for amendments.`
    : null
}

export const approveSchema = z.object({
  approved_by_employee_id: z.string().uuid('Choose who is approving this'),
  approval_notes:          longNote,
})

/**
 * An optional money field typed into a text input. An untouched box arrives as
 * `''`, which `z.coerce.number()` would happily read as 0 — and a 0 default
 * price is a lie the delivery screen would later pre-fill. Empty means "no
 * standing rate", so it has to reach the database as null.
 */
const optionalPrice = z.preprocess(
  (v) => (v === '' || v === null || v === undefined ? null : v),
  z.coerce.number().min(0, 'Price cannot be negative').max(10_000_000).nullable(),
)

/**
 * Names are stored as a single `English / বাংলা` string (see lib/kitchen/
 * item-name.ts) but are typed as two fields, because merging them by hand
 * meant people forgot the spaces around the slash and the halves stopped
 * lining up with the seeded catalogue.
 */
const itemNameFields = {
  name_en: z.string().trim().min(1, 'English name is required').max(120),
  name_bn: z.string().trim().max(120).default(''),
}

export const kitchenItemCreateSchema = z.object({
  ...itemNameFields,
  kitchen_vendor_id:  z.string().uuid().nullish().transform((v) => v || null),
  category_id:        z.string().uuid().nullish().transform((v) => v || null),
  unit_id:            z.string().uuid('Pick a unit of measurement'),
  default_unit_price: optionalPrice,
})

/** Editing an existing item's defaults — the vendor tag has its own action. */
export const kitchenItemUpdateSchema = z.object({
  ...itemNameFields,
  unit_id:            z.string().uuid('Pick a unit of measurement'),
  default_unit_price: optionalPrice,
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

// ─── Deliveries ─────────────────────────────────────────────────────────────

/**
 * A delivery line while the storekeeper is typing at 6am.
 *
 * Permissive for the same reason the requisition line is: the row appears on
 * screen before a weight is entered, and the autosave fires a second later.
 * Zero-delivered is a legitimate saved state — it means "ordered, nothing
 * came" — so unlike a requisition line it is NOT dropped on write.
 */
export const deliveryLineSchema = z.object({
  id:                  z.string().uuid().optional(),
  sort_order:          z.number().int().min(0).default(0),
  requisition_line_id: z.string().uuid().nullish().transform((v) => v || null),
  item_id:             z.string().uuid().nullish().transform((v) => v || null),
  item_name:           z.string().trim().max(200).default(''),
  qty_ordered:         z.coerce.number().nullish().transform((v) => (v === null || v === undefined ? null : Number(v))),
  qty_delivered:       z.coerce.number().min(0).catch(0).default(0),
  rejected_qty:        z.preprocess((v) => (v === '' || v === null || v === undefined ? null : v),
                         z.coerce.number().min(0).nullable()),
  reject_reason:       nullableStr,
  piece_count:         z.preprocess((v) => (v === '' || v === null || v === undefined ? null : v),
                         z.coerce.number().min(0).nullable()),
  unit_id:             z.string().uuid().nullish().transform((v) => v || null),
  unit_price:          z.coerce.number().min(0).catch(0).default(0),
  is_unrequested:      z.boolean().default(false),
  notes:               nullableStr,
  /** UI-only: "make this rate the item's standing rate" — applied at confirm,
   *  never written to the delivery line itself. */
  set_default_price:   z.boolean().default(false),
})

export const deliveryDraftSchema = z.object({
  requisition_id:    z.string().uuid().nullish().transform((v) => v || null),
  kitchen_vendor_id: z.string().uuid().nullish().transform((v) => v || null),
  supplier_id:       z.string().uuid().nullish().transform((v) => v || null),
  delivery_date:     z.string().nullish().transform((v) => v || null),
  supplier_memo_no:  nullableStr,
  /** What the supplier's own paper says the total is — compared, never used. */
  supplier_memo_total: optionalPrice,
  received_by_employee_id: z.string().uuid().nullish().transform((v) => v || null),
  notes:             nullableStr,
  lines:             z.array(deliveryLineSchema).default([]),
}).partial()

/**
 * Confirming a delivery is the point it becomes money owed, so this is where
 * the real checks live. A rate of zero is the one that matters: it produces a
 * bill of zero, which reconciles against nothing and is never noticed until
 * the supplier calls.
 */
export const deliveryConfirmSchema = z.object({
  kitchen_vendor_id: z.string().uuid('Pick which supplier this is from'),
  delivery_date:     z.string().min(1, 'Delivery date is required'),
  lines:             z.array(deliveryLineSchema).min(1, 'Add at least one item'),
}).superRefine((data, ctx) => {
  const live = data.lines.filter((l) => Number(l.qty_delivered) > 0)
  if (live.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom, path: ['lines'],
      message: 'Nothing was delivered — record a quantity, or cancel this delivery.',
    })
    return
  }
  const unpriced = live.find((l) => !(Number(l.unit_price) > 0))
  if (unpriced) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom, path: ['lines'],
      message: `"${unpriced.item_name || 'An item'}" has no rate — the bill would come to zero.`,
    })
  }
  // NOTE deliberately no rejected<=got rule: "Got" is what was ACCEPTED and
  // billed; "Rejected" is what went back on the van, and it may legitimately
  // exceed what was kept (10 kg arrived, 8 rejected, kept 2).
})

// ─── Payments ───────────────────────────────────────────────────────────────

export const paymentSchema = z.object({
  kitchen_vendor_id: z.string().uuid('Pick a supplier'),
  supplier_id:       z.string().uuid().nullish().transform((v) => v || null),
  payment_date:      z.string().min(1, 'Payment date is required'),
  method:            z.enum(['cheque', 'cash', 'bank_transfer', 'bkash', 'nagad', 'adjustment'])
                       .default('cheque'),
  cheque_no:         nullableStr,
  cheque_date:       z.string().nullish().transform((v) => v || null),
  bank_name:         nullableStr,
  amount:            z.coerce.number().positive('Enter the amount paid'),
  notes:             nullableStr,
  /** delivery_id → amount. Settles specific bills; may be empty (on account). */
  allocations:       z.array(z.object({
                       delivery_id: z.string().uuid(),
                       amount:      z.coerce.number().positive(),
                     })).default([]),
}).superRefine((data, ctx) => {
  // A cheque with no number cannot be matched against the bank statement, and
  // matching it later means going back through photographs.
  if (data.method === 'cheque' && !data.cheque_no) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom, path: ['cheque_no'],
      message: 'Cheque number is required',
    })
  }
  const allocated = data.allocations.reduce((n, a) => n + Number(a.amount), 0)
  // Rounding: allow a paisa either way rather than blocking on float noise.
  if (allocated > Number(data.amount) + 0.01) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom, path: ['allocations'],
      message: `Allocated ${allocated.toFixed(2)} against a payment of ${Number(data.amount).toFixed(2)}.`,
    })
  }
})

// ─── Requisition templates ──────────────────────────────────────────────────

export const templateLineSchema = z.object({
  sort_order:        z.number().int().min(0).default(0),
  item_id:           z.string().uuid().nullish().transform((v) => v || null),
  item_name:         z.string().trim().min(1).max(200),
  kitchen_vendor_id: z.string().uuid().nullish().transform((v) => v || null),
  /**
   * Zero is legal here, unlike on a requisition line. "Always order fish,
   * decide the weight on the day" is a real standing instruction, and the
   * template is a checklist as much as it is a set of numbers.
   */
  qty:               z.coerce.number().min(0).catch(0).default(0),
  piece_count:       z.preprocess((v) => (v === '' || v === null || v === undefined ? null : v),
                       z.coerce.number().min(0).nullable()),
  unit_id:           z.string().uuid().nullish().transform((v) => v || null),
  notes:             nullableStr,
})

export const templateSchema = z.object({
  name:        z.string().trim().min(1, 'Give the template a name').max(60),
  description: nullableStr,
  is_active:   z.boolean().default(true),
  lines:       z.array(templateLineSchema).default([]),
})
