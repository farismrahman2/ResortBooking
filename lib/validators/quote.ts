import { z } from 'zod'
import { ROOM_NUMBERS } from '@/lib/config/rooms'
import { deriveGroupHeader, roomNumberClashesOnDate, distinctDates } from '@/lib/bookings/group-itinerary'
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
  /** Handed over in the evening on the check-in day. Night stays only. */
  evening_rooms: z.array(z.string()).default([]),
})

// ── Group itinerary ─────────────────────────────────────────────────────────
// One segment per (date, kind). See lib/bookings/group-itinerary.ts.
const GroupSegmentRoomSchema = z.object({
  room_type:    z.string().min(1),
  display_name: z.string().optional(),
  qty:          z.number().int().min(1, 'Quantity must be at least 1'),
  unit_price:   z.number().int().min(0),
  room_numbers: z.array(z.string()).default([]),
  evening_rooms: z.array(z.string()).default([]),
})

export const GroupSegmentSchema = z.object({
  day_date:      z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a date'),
  stay_kind:     z.enum(['night', 'daylong']),
  adults:        z.number().int().min(0).default(0),
  adults_comp:   z.number().int().min(0).default(0),
  children_paid: z.number().int().min(0).default(0),
  children_free: z.number().int().min(0).default(0),
  drivers:       z.number().int().min(0).default(0),
  extra_beds:    z.number().int().min(0).default(0),
  rooms:         z.array(GroupSegmentRoomSchema).default([]),
  notes:         z.string().trim().max(300).nullish().transform((v) => v || null),
})
export type GroupSegmentInput = z.infer<typeof GroupSegmentSchema>

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

  // Package. A group prices its nights from package_id and its day guests
  // from day_package_id; either may be absent when the itinerary has no
  // segment of that kind (enforced in the group refinements below).
  package_id:   z.string().uuid('Please select a valid package').or(z.literal('')),
  package_type: z.enum(['daylong', 'night', 'group']),
  day_package_id: z.string().uuid().nullish().transform((v) => v || null),

  // Group itinerary — empty for daylong / night quotes.
  days: z.array(GroupSegmentSchema).default([]),

  // Dates
  visit_date:     z.string().min(1, 'Date is required'),    // ISO date
  check_out_date: z.string().nullish().transform(v => v || null),

  // Guests
  adults:        z.number().int().min(0),
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
  /** How the advance arrived. This resort takes advances via bKash or bank
   *  transfer only — feeds the money-received-by-method reconciliation. */
  advance_method:      z.enum(['bkash', 'bank_transfer']).default('bkash'),

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
  // A daylong visit has no check-out date, FULL STOP. A quote drafted as a
  // night stay and then switched to daylong used to keep its old check-out
  // date invisibly — the converted booking then blocked room availability for
  // a range the guest never stays, and the checkout screen filed the guest
  // under the phantom check-out day instead of the visit day.
  .transform((data) => {
    if (data.package_type === 'daylong') return { ...data, check_out_date: null }
    // A group's dates and headcount are DERIVED from its itinerary — the form
    // sends whatever it had, and the itinerary wins, so the two can't drift.
    if (data.package_type === 'group') {
      const h = deriveGroupHeader(data.days)
      if (!h) return data
      return {
        ...data,
        visit_date:     h.visit_date,
        check_out_date: h.check_out_date,
        adults:         h.adults,
        children_paid:  h.children_paid,
        children_free:  h.children_free,
        drivers:        h.drivers,
        extra_beds:     h.extra_beds,
      }
    }
    return data
  })
  .refine(
    (data) => data.package_type === 'group' || data.adults >= 1,
    { message: 'At least 1 adult required', path: ['adults'] },
  )
  .refine(
    (data) => data.package_type === 'group' || data.package_id.length > 0,
    { message: 'Please select a valid package', path: ['package_id'] },
  )
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
    if (data.package_type === 'group') {
      if (data.days.length === 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['days'], message: 'Add at least one day to the itinerary' })
        return
      }
      const seen = new Set<string>()
      const hasDay   = data.days.some((d) => d.stay_kind === 'daylong')
      const hasNight = data.days.some((d) => d.stay_kind === 'night')
      if (hasNight && !data.package_id) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['package_id'], message: 'Pick a night package to price the overnight stays' })
      }
      if (hasDay && !data.day_package_id) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['day_package_id'], message: 'Pick a daylong package to price the day guests' })
      }
      data.days.forEach((d, i) => {
        const key = `${d.day_date}:${d.stay_kind}`
        if (seen.has(key)) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['days', i, 'day_date'], message: `Two ${d.stay_kind} entries on ${d.day_date} — merge them` })
        }
        seen.add(key)
        if (d.adults + d.children_paid + d.children_free < 1) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['days', i, 'adults'], message: `${d.day_date}: at least one guest` })
        }
        if (d.adults_comp > d.adults) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['days', i, 'adults_comp'], message: `${d.day_date}: complimentary adults can't exceed adults` })
        }
        if (d.stay_kind === 'night' && d.rooms.length === 0) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['days', i, 'rooms'], message: `${d.day_date}: an overnight entry needs at least one room` })
        }
        if (d.stay_kind === 'night' && d.rooms.some((r) => r.room_type === 'tree_house')) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['days', i, 'rooms'], message: 'Tree House is available for day use only' })
        }
        d.rooms.forEach((r, ri) => {
          const stray = r.evening_rooms.filter((n) => !r.room_numbers.includes(n))
          if (stray.length) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['days', i, 'rooms', ri, 'evening_rooms'], message: `${d.day_date}: room ${stray.join(', ')} is marked for evening handover but not selected` })
          }
          if (d.stay_kind === 'daylong' && r.evening_rooms.length) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['days', i, 'rooms', ri, 'evening_rooms'], message: `${d.day_date}: evening handover applies to overnight rooms only` })
          }
          const fixed = ROOM_NUMBERS[r.room_type as RoomType] ?? []
          if (fixed.length === 0) return
          if (r.room_numbers.length !== r.qty) {
            const name = r.display_name ?? r.room_type.replace(/_/g, ' ')
            ctx.addIssue({
              code: z.ZodIssueCode.custom, path: ['days', i, 'rooms', ri, 'room_numbers'],
              message: `${d.day_date}: pick ${r.qty} room number${r.qty > 1 ? 's' : ''} for ${name} (picked ${r.room_numbers.length}).`,
            })
          }
        })
      })
      // The same physical room can't be slept in AND lent to day guests on
      // one date — unless it is handed over in the evening, in which case the
      // day guests have it first. Across dates is fine: that is how Room 101
      // stays booked for three nights.
      for (const date of distinctDates(data.days)) {
        const dupes = roomNumberClashesOnDate(data.days, date)
        if (dupes.length) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['days'], message: `Room ${dupes.join(', ')} is used twice on ${date} — mark it for evening handover if the day guests have it first` })
        }
      }
      return
    }
    // Evening handover only means something on a night stay's check-in day,
    // and only for rooms the booking actually has.
    data.rooms.forEach((r, idx) => {
      const stray = r.evening_rooms.filter((n) => !r.room_numbers.includes(n))
      if (stray.length) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['rooms', idx, 'evening_rooms'], message: `Room ${stray.join(', ')} is marked for evening handover but not selected` })
      }
      if (data.package_type === 'daylong' && r.evening_rooms.length) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['rooms', idx, 'evening_rooms'], message: 'Evening handover applies to night stays only' })
      }
    })
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
