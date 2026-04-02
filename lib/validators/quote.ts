import { z } from 'zod'

export const ExtraItemSchema = z.object({
  label:      z.string().min(1, 'Item name is required'),
  qty:        z.number().int().min(1, 'Qty must be at least 1'),
  unit_price: z.number().int().min(0, 'Price must be 0 or more'),
})

const RoomSelectionSchema = z.object({
  room_type:    z.string(),
  display_name: z.string(),
  qty:          z.number().int().min(1, 'Quantity must be at least 1'),
  unit_price:   z.number().int().min(0),
  room_numbers: z.array(z.string()).default([]),
})

const BaseQuoteSchema = z.object({
  // Customer
  customer_name:  z.string().min(1, 'Customer name is required'),
  customer_phone: z.string().min(1, 'Phone number is required'),
  customer_notes: z.string().optional(),

  // Package
  package_id:   z.string().uuid('Please select a valid package'),
  package_type: z.enum(['daylong', 'night']),

  // Dates
  visit_date:     z.string().min(1, 'Date is required'),    // ISO date
  check_out_date: z.string().nullish().transform(v => v || null),

  // Guests
  adults:        z.number().int().min(1, 'At least 1 adult required'),
  children_paid: z.number().int().min(0).default(0),
  children_free: z.number().int().min(0).default(0),
  drivers:       z.number().int().min(0).default(0),
  extra_beds:    z.number().int().min(0).default(0),

  // Rooms (optional for daylong, required for night stays)
  rooms: z.array(RoomSelectionSchema).default([]),

  // Pricing overrides
  discount:            z.number().int().min(0).default(0),
  service_charge_pct:  z.number().int().min(0).max(100).default(0),
  advance_required:    z.number().int().min(0).default(0),
  advance_paid:        z.number().int().min(0).default(0),

  // Extra custom items
  extra_items: z.array(ExtraItemSchema).default([]),
})

export const CreateQuoteSchema = BaseQuoteSchema
  .refine(
    (data) => {
      if (data.package_type === 'night') {
        return !!data.check_out_date && data.check_out_date > data.visit_date
      }
      return true
    },
    { message: 'Check-out date must be after check-in date for night stays', path: ['check_out_date'] },
  )
  .refine(
    (data) => {
      // Night stays require at least one room
      if (data.package_type === 'night') {
        return data.rooms.length > 0
      }
      return true
    },
    { message: 'At least one room is required for night stays', path: ['rooms'] },
  )
  .refine(
    (data) => {
      // Tree House cannot be booked for night stays
      if (data.package_type === 'night') {
        return !data.rooms.some((r) => r.room_type === 'tree_house')
      }
      return true
    },
    { message: 'Tree House is available for daylong bookings only', path: ['rooms'] },
  )

export type CreateQuoteInput = z.infer<typeof CreateQuoteSchema>

export const UpdateQuoteSchema = BaseQuoteSchema.partial().extend({
  status: z.enum(['draft', 'sent', 'confirmed', 'cancelled']).optional(),
})

export type UpdateQuoteInput = z.infer<typeof UpdateQuoteSchema>

export const UpdateQuoteStatusSchema = z.object({
  status: z.enum(['draft', 'sent', 'confirmed', 'cancelled']),
})
