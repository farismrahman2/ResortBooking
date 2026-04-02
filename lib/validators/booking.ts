import { z } from 'zod'

export const UpdateBookingSchema = z.object({
  customer_name:    z.string().min(1).optional(),
  customer_phone:   z.string().min(1).optional(),
  customer_notes:   z.string().optional(),
  discount:         z.number().int().min(0).optional(),
  advance_required: z.number().int().min(0).optional(),
  advance_paid:     z.number().int().min(0).optional(),
  status:           z.enum(['confirmed', 'cancelled']).optional(),
})

export type UpdateBookingInput = z.infer<typeof UpdateBookingSchema>

export const UpdateAdvanceSchema = z.object({
  advance_paid:     z.number().int().min(0),
  advance_required: z.number().int().min(0),
})

export type UpdateAdvanceInput = z.infer<typeof UpdateAdvanceSchema>
