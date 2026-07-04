import { z } from 'zod'

const nullableStr = z.string().trim().min(1).nullable().optional()
const rating      = (label: string) => z.number({ invalid_type_error: `${label} rating required` }).int().min(1, `${label} rating required`).max(5)

export const qaReviewFormSchema = z.object({
  booking_id:           z.string().uuid(),
  room_service_rating:  rating('Room service'),
  room_service_comment: nullableStr,
  food_rating:          rating('Food taste'),
  food_comment:         nullableStr,
  other_issue:          z.boolean().default(false),
  other_comment:        nullableStr,
  overall_rating:       rating('Overall'),
  would_return:         z.enum(['yes', 'no', 'maybe']).nullable().optional(),
}).superRefine((v, ctx) => {
  // A rating below 5 must carry a reason — that "why" is what drives service
  // improvement. Room and food need their own note; a low overall is satisfied
  // by a note in any comment box. Enforced here so it can't be bypassed.
  const has = (s: unknown) => typeof s === 'string' && s.trim().length > 0
  if (v.room_service_rating < 5 && !has(v.room_service_comment)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['room_service_comment'], message: 'Add a reason — room service is below 5★.' })
  }
  if (v.food_rating < 5 && !has(v.food_comment)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['food_comment'], message: 'Add a reason — food taste is below 5★.' })
  }
  const anyReason = has(v.room_service_comment) || has(v.food_comment) || has(v.other_comment)
  if (v.overall_rating < 5 && !anyReason) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['overall_rating'], message: 'Add a reason — overall is below 5★.' })
  }
})

export const qaSkipSchema = z.object({
  booking_id: z.string().uuid(),
  status:     z.enum(['unreachable', 'declined']),
  note:       nullableStr,
})

export type QaReviewFormInput = z.input<typeof qaReviewFormSchema>
export type QaSkipInput       = z.input<typeof qaSkipSchema>
