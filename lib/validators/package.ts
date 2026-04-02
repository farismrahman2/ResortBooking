import { z } from 'zod'

export const PackageFormSchema = z.object({
  // Basic info
  name:          z.string().min(1, 'Package name is required'),
  type:          z.enum(['daylong', 'night']),
  is_active:     z.boolean().default(true),
  display_order: z.number().int().min(0).default(0),

  // Validity
  all_year:       z.boolean().default(true),
  valid_from:     z.string().nullish().transform(v => v || null),
  valid_to:       z.string().nullish().transform(v => v || null),
  specific_dates: z.array(z.string()).default([]),
  is_override:    z.boolean().default(false),

  // Pricing
  weekday_adult: z.number().int().min(0).default(0),
  friday_adult:  z.number().int().min(0).default(0),
  holiday_adult: z.number().int().min(0).default(0),
  child_meal:    z.number().int().min(0).default(1500),
  driver_price:  z.number().int().min(0).default(0),
  extra_person:  z.number().int().min(0).default(0),
  extra_bed:     z.number().int().min(0).default(0),

  // Timing
  check_in:  z.string().default('08:00'),
  check_out: z.string().default('18:00'),

  // Meal inclusions
  includes_breakfast: z.boolean().default(true),
  includes_lunch:     z.boolean().default(true),
  includes_dinner:    z.boolean().default(true),
  includes_snacks:    z.boolean().default(false),

  // Text blocks (all optional)
  title:         z.string().optional(),
  intro:         z.string().optional(),
  meals:         z.string().optional(),
  activities:    z.string().optional(),
  experience:    z.string().optional(),
  why_choose_us: z.string().optional(),
  cta:           z.string().optional(),
  notes:         z.string().optional(),

  // Room prices (keyed by room_type)
  room_prices: z.record(z.string(), z.number().int().min(0)).default({}),
})
.refine(
  (data) => {
    if (!data.all_year && data.specific_dates.length === 0) {
      return !!(data.valid_from && data.valid_to && data.valid_from <= data.valid_to)
    }
    return true
  },
  {
    message: 'Valid From must be before or equal to Valid To when not all-year',
    path: ['valid_to'],
  },
)

export type PackageFormInput = z.infer<typeof PackageFormSchema>
