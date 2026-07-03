/**
 * Row types for the Meal Menu Generator (খাবারের মেনু) module. Kept separate
 * from lib/supabase/types.ts so the core types file doesn't grow further.
 */

export type MenuStatus = 'draft' | 'finalized'
export type NoteColor  = 'green' | 'blue' | 'red'

export interface MenuMealTypeRow {
  id:                   string
  slug:                 string
  display_name:         string        // Bangla, as printed
  default_serving_time: string | null
  display_order:        number
  is_active:            boolean
  created_at:           string
}

export interface MenuDishRow {
  id:          string
  name:        string
  category:    string | null
  usage_count: number
  is_active:   boolean
  created_at:  string
}

export interface MenuDayRow {
  id:            string
  menu_date:     string        // YYYY-MM-DD
  occasion_note: string | null
  booking_id:    string | null
  status:        MenuStatus
  finalized_at:  string | null
  finalized_by:  string | null
  created_by:    string | null
  created_at:    string
  updated_at:    string
}

export interface MenuMealRow {
  id:                 string
  menu_day_id:        string
  meal_type_id:       string
  serving_time:       string | null
  headcount_total:    number | null
  headcount_adults:   number | null
  headcount_children: number | null
  headcount_drivers:  number | null
  display_order:      number
  created_at:         string
}

export interface MenuMealItemRow {
  id:              string
  meal_id:         string
  text:            string        // printed verbatim, incl. portion notes
  dish_catalog_id: string | null
  display_order:   number
  created_at:      string
}

export interface MenuSpecialNoteRow {
  id:            string
  menu_day_id:   string
  meal_id:       string | null   // null = day-level note
  text:          string
  color:         NoteColor
  display_order: number
  created_at:    string
}

export interface MenuTemplateRow {
  id:           string
  name:         string
  meal_type_id: string
  serving_time: string | null
  items:        Array<{ text: string }>
  created_by:   string | null
  created_at:   string
}

/** A meal with its type, items, and meal-level notes — editor/print shape. */
export interface MenuMealFull extends MenuMealRow {
  meal_type: MenuMealTypeRow
  items:     MenuMealItemRow[]
  notes:     MenuSpecialNoteRow[]
}

/** Full menu day: meals (each with items + notes) plus day-level notes. */
export interface MenuDayFull extends MenuDayRow {
  meals:     MenuMealFull[]
  day_notes: MenuSpecialNoteRow[]
}

/** Prefill payload pulled from a confirmed booking. */
export interface MenuBookingPrefill {
  booking_id:     string
  booking_number: string
  customer_name:  string
  visit_date:     string
  adults:         number
  children:       number   // children_paid + children_free
  drivers:        number
  total:          number   // adults + children + drivers (prefill only)
}
