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
})

export const qaSkipSchema = z.object({
  booking_id: z.string().uuid(),
  status:     z.enum(['unreachable', 'declined']),
  note:       nullableStr,
})

export type QaReviewFormInput = z.input<typeof qaReviewFormSchema>
export type QaSkipInput       = z.input<typeof qaSkipSchema>
