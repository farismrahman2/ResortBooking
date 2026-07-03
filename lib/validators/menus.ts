import { z } from 'zod'

const nullableStr = z.string().trim().min(1).nullable().optional()
const isoDate     = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date')
const headcount   = z.number().int().min(0).nullable().optional()

export const menuDayFormSchema = z.object({
  menu_date:     isoDate,
  occasion_note: nullableStr,
  booking_id:    z.string().uuid().nullable().optional(),
})

export const menuDayUpdateSchema = z.object({
  id:            z.string().uuid(),
  menu_date:     isoDate.optional(),
  occasion_note: z.string().trim().nullable().optional(),
})

export const mealFormSchema = z.object({
  menu_day_id:        z.string().uuid(),
  meal_type_id:       z.string().uuid(),
  serving_time:       z.string().trim().nullable().optional(),
  headcount_total:    headcount,
  headcount_adults:   headcount,
  headcount_children: headcount,
  headcount_drivers:  headcount,
})

export const mealUpdateSchema = z.object({
  id:                 z.string().uuid(),
  serving_time:       z.string().trim().nullable().optional(),
  headcount_total:    headcount,
  headcount_adults:   headcount,
  headcount_children: headcount,
  headcount_drivers:  headcount,
})

export const mealItemSchema = z.object({
  text:            z.string().trim().min(1, 'Dish text required'),
  dish_catalog_id: z.string().uuid().nullable().optional(),
})

export const setMealItemsSchema = z.object({
  meal_id: z.string().uuid(),
  items:   z.array(mealItemSchema).max(100),
})

export const specialNoteSchema = z.object({
  menu_day_id: z.string().uuid(),
  meal_id:     z.string().uuid().nullable().optional(),
  text:        z.string().trim().min(1, 'Note text required'),
  color:       z.enum(['green', 'blue', 'red']).default('green'),
})

export const specialNoteUpdateSchema = z.object({
  id:    z.string().uuid(),
  text:  z.string().trim().min(1).optional(),
  color: z.enum(['green', 'blue', 'red']).optional(),
})

export const templateSchema = z.object({
  name:         z.string().trim().min(1, 'Template name required'),
  meal_type_id: z.string().uuid(),
  serving_time: z.string().trim().nullable().optional(),
  items:        z.array(z.object({ text: z.string().trim().min(1) })).min(1, 'Template needs at least one dish').max(100),
})

export type MenuDayFormInput    = z.input<typeof menuDayFormSchema>
export type MenuDayUpdateInput  = z.input<typeof menuDayUpdateSchema>
export type MealFormInput       = z.input<typeof mealFormSchema>
export type MealUpdateInput     = z.input<typeof mealUpdateSchema>
export type SetMealItemsInput   = z.input<typeof setMealItemsSchema>
export type SpecialNoteInput    = z.input<typeof specialNoteSchema>
export type SpecialNoteUpdate   = z.input<typeof specialNoteUpdateSchema>
export type TemplateInput       = z.input<typeof templateSchema>
