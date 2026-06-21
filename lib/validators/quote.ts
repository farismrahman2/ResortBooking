import { z } from 'zod'
import { ROOM_NUMBERS } from '@/lib/config/rooms'
import type { RoomType } from '@/lib/supabase/types'

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

/** Returns a message for the first room row whose picked room_numbers don't
 *  match its qty, or null if every row is fine. Room types with no fixed
 *  numbers in ROOM_NUMBERS (e.g. tree_house) are skipped. */
export function findUnassignedRoomNumbersError(
  rooms: { room_type: string; display_name?: string; qty: number; room_numbers: string[] }[],
): string | null {
  for (const r of rooms) {
    const fixed = ROOM_NUMBERS[r.room_type as RoomType] ?? []
    if (fixed.length === 0) continue
    if (r.room_numbers.length !== r.qty) {
      const name = r.display_name ?? r.room_type.replace(/_/g, ' ')
      return `Pick ${r.qty} room number${r.qty > 1 ? 's' : ''} for ${name} (picked ${r.room_numbers.length}).`
    }
  }
  return null
}

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
  discount_pct:        z.number().int().min(0).max(100).default(0),
  service_charge_pct:  z.number().int().min(0).max(100).default(0),
  advance_required:    z.number().int().min(0).default(0),
  advance_paid:        z.number().int().min(0).default(0),

  // Extra custom items
  extra_items: z.array(ExtraItemSchema).default([]),

  // Sales attribution — optional FK to employees(id) where is_sales = true
  sales_employee_id: z.string().uuid().nullable().optional(),

  // Corporate-booking flag + company. company_name is required-when-corporate
  // (enforced in the superRefine below + a DB CHECK constraint).
  is_corporate:         z.boolean().default(false),
  company_name:         z.string().trim().max(120).nullable().optional(),
  corporate_account_id: z.string().uuid().nullable().optional(),
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
  .superRefine((data, ctx) => {
    // Corporate booking → company_name required and non-empty (matches the
    // DB CHECK constraint added by migrations/crm-module/004_quote_corporate_flag.sql).
    if (data.is_corporate) {
      const name = (data.company_name ?? '').trim()
      if (!name) {
        ctx.addIssue({
          code:    z.ZodIssueCode.custom,
          path:    ['company_name'],
          message: 'Company name is required for a corporate booking',
        })
      }
    }
    // Every selected room type with fixed room numbers must have exactly qty
    // specific room numbers picked. Prevents "ghost" rooms where the booking
    // has a room type but no physical room assigned.
    data.rooms.forEach((r, idx) => {
      const fixed = ROOM_NUMBERS[r.room_type as RoomType] ?? []
      if (fixed.length === 0) return
      if (r.room_numbers.length !== r.qty) {
        const name = r.display_name ?? r.room_type.replace(/_/g, ' ')
        ctx.addIssue({
          code:    z.ZodIssueCode.custom,
          path:    ['rooms', idx, 'room_numbers'],
          message: `Pick ${r.qty} room number${r.qty > 1 ? 's' : ''} for ${name} (picked ${r.room_numbers.length}).`,
        })
      }
    })
  })

export type CreateQuoteInput = z.infer<typeof CreateQuoteSchema>

export const UpdateQuoteSchema = BaseQuoteSchema.partial().extend({
  status: z.enum(['draft', 'sent', 'confirmed', 'cancelled']).optional(),
})

export type UpdateQuoteInput = z.infer<typeof UpdateQuoteSchema>

export const UpdateQuoteStatusSchema = z.object({
  status: z.enum(['draft', 'sent', 'confirmed', 'cancelled']),
})
