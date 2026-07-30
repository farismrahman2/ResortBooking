import { z } from 'zod'

/**
 * Two schemas by design (build brief §5):
 *   - fieldVisitDraftSchema  — everything optional. A rep standing in a lobby
 *     on flaky mobile data must ALWAYS be able to save, however empty.
 *   - fieldVisitSubmitSchema — the required set, enforced only at submit.
 */

const nullableStr = z.string().trim().max(500).nullish().transform((v) => v || null)
const nullableInt = z.coerce.number().int().min(0).nullish().transform((v) => (v ?? null))
const strArray    = z.array(z.string()).default([])

export const fieldVisitContactSchema = z.object({
  id:                z.string().uuid().optional(),
  sort_order:        z.number().int().min(0).default(0),
  name:              nullableStr,
  designation:       nullableStr,
  department:        nullableStr,
  mobile:            nullableStr,
  email:             nullableStr,
  is_decision_maker: z.boolean().default(false),
})

export const fieldVisitVenueSchema = z.object({
  id:               z.string().uuid().optional(),
  sort_order:       z.number().int().min(0).default(0),
  venue_name:       nullableStr,
  event_month_year: nullableStr,
  pax:              nullableInt,
  rate_per_head:    z.coerce.number().min(0).nullish().transform((v) => (v ?? null)),
  feedback:         nullableStr,
})

/** Draft — every field optional. Never rejects on incomplete data. */
export const fieldVisitDraftSchema = z.object({
  visit_date:         z.string().nullish().transform((v) => v || null),
  sales_executive_id: z.string().uuid().nullish().transform((v) => v || null),
  territory_zone:     nullableStr,
  visit_type:         z.enum(['cold_visit', 'appointment', 'follow_up', 'referral']).nullish().transform((v) => v || null),

  organisation_name: nullableStr,
  office_address:    z.string().trim().max(2000).nullish().transform((v) => v || null),
  sector_id:         z.string().uuid().nullish().transform((v) => v || null),
  employee_band:     nullableStr,

  decision_signoff:  strArray,
  best_time_to_call: nullableStr,
  preferred_channel: strArray,

  event_types:          strArray,
  events_per_year:      nullableStr,
  typical_headcount:    nullableStr,
  event_format:         strArray,
  preferred_day:        strArray,
  budget_per_head_band: nullableStr,
  rooms_needed:         nullableInt,
  annual_event_spend:   z.coerce.number().min(0).nullish().transform((v) => (v ?? null)),
  peak_months:          strArray,
  transport:            strArray,

  interest_level:     z.enum(['hot', 'warm', 'cold']).nullish().transform((v) => v || null),
  materials_given:    strArray,
  next_event_month:   nullableStr,
  next_event_type:    nullableStr,
  next_event_pax:     nullableInt,
  next_step:          strArray,
  due_by:             z.string().nullish().transform((v) => v || null),
  follow_up_owner_id: z.string().uuid().nullish().transform((v) => v || null),

  account_id: z.string().uuid().nullish().transform((v) => v || null),

  contacts: z.array(fieldVisitContactSchema).default([]),
  venues:   z.array(fieldVisitVenueSchema).default([]),
}).partial()

export type FieldVisitDraftInput = z.input<typeof fieldVisitDraftSchema>

/**
 * Submit — the blocking validation. Required set per the build brief:
 * visit_date, sales_executive_id, organisation_name, interest_level,
 * next_step (>=1), and at least one contact with a name.
 *
 * `group` on each issue lets the review step mark the right section red and
 * jump the rep back to the step that owns the missing field.
 */
export const fieldVisitSubmitSchema = fieldVisitDraftSchema.extend({
  visit_date:         z.string().min(1, 'Visit date is required'),
  sales_executive_id: z.string().uuid('Sales executive is required'),
  organisation_name:  z.string().trim().min(1, 'Organisation name is required'),
  interest_level:     z.enum(['hot', 'warm', 'cold'], { errorMap: () => ({ message: 'Interest level is required' }) }),
  next_step:          z.array(z.string()).min(1, 'Pick at least one next step'),
  contacts:           z.array(fieldVisitContactSchema),
}).superRefine((data, ctx) => {
  const named = (data.contacts ?? []).filter((c) => (c.name ?? '').trim().length > 0)
  if (named.length === 0) {
    ctx.addIssue({
      code:    z.ZodIssueCode.custom,
      path:    ['contacts'],
      message: 'Add at least one contact with a name',
    })
  }
})

export type FieldVisitSubmitInput = z.input<typeof fieldVisitSubmitSchema>

/** Maps a failed-submit field path to the wizard step that owns it. */
export const FIELD_TO_STEP: Record<string, number> = {
  visit_date: 1, sales_executive_id: 1, territory_zone: 1, visit_type: 1,
  organisation_name: 2, office_address: 2, sector_id: 2, employee_band: 2,
  contacts: 3, decision_signoff: 3, best_time_to_call: 3, preferred_channel: 3,
  event_types: 4, events_per_year: 4, typical_headcount: 4, event_format: 4,
  preferred_day: 4, budget_per_head_band: 4, rooms_needed: 4,
  annual_event_spend: 4, peak_months: 4, transport: 4,
  venues: 5,
  interest_level: 6, materials_given: 6, next_event_month: 6, next_event_type: 6,
  next_event_pax: 6, next_step: 6, due_by: 6, follow_up_owner_id: 6,
}

export const STEP_TITLES = [
  '', 'Visit', 'Organisation', 'Contacts', 'Requirements', 'Current venues', 'Outcome', 'Review',
] as const
export const TOTAL_STEPS = 7
