import { createClient } from '@/lib/supabase/server'
import { getMealsForBookingOnDate } from '@/lib/engine/meals'
import { dishSearchMatches } from '@/lib/menus/transliterate'
import type {
  MenuBookingPrefill,
  MenuDayFull,
  MenuDayRow,
  MenuDishRow,
  MenuMealTypeRow,
  MenuSpecialNoteRow,
  MenuStatus,
  MenuTemplateRow,
} from '@/lib/supabase/types-menus'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const dbc = () => createClient() as any

export interface MenuDayFilters {
  from?:      string
  to?:        string
  status?:    MenuStatus
  bookingId?: string
  limit?:     number
}

export interface MenuDayListRow extends MenuDayRow {
  meal_count: number
}

/** Menu days for the list/calendar view, newest first. */
export async function listMenuDays(filters: MenuDayFilters = {}): Promise<MenuDayListRow[]> {
  let query = dbc()
    .from('menu_days')
    .select('*, menu_meals(id)')
    .order('menu_date', { ascending: false })
    .order('created_at', { ascending: false })

  if (filters.from)      query = query.gte('menu_date', filters.from)
  if (filters.to)        query = query.lte('menu_date', filters.to)
  if (filters.status)    query = query.eq('status', filters.status)
  if (filters.bookingId) query = query.eq('booking_id', filters.bookingId)
  query = query.limit(filters.limit ?? 100)

  const { data, error } = await query
  if (error) throw new Error(`listMenuDays: ${error.message}`)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data ?? []) as any[]).map((d) => ({
    ...d,
    meal_count: (d.menu_meals ?? []).length,
    menu_meals: undefined,
  }))
}

/** Full menu day: meals (with type, items, notes) + day-level notes,
 *  everything sorted by display_order — the editor/print shape. */
export async function getMenuDayFull(id: string): Promise<MenuDayFull | null> {
  const { data, error } = await dbc()
    .from('menu_days')
    .select(`
      *,
      menu_meals (
        *,
        meal_type:menu_meal_types (*),
        items:menu_meal_items (*),
        notes:menu_special_notes (*)
      ),
      day_notes:menu_special_notes (*)
    `)
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(`getMenuDayFull: ${error.message}`)
  if (!data) return null

  const byOrder = (a: { display_order: number }, b: { display_order: number }) =>
    a.display_order - b.display_order

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const meals = ((data.menu_meals ?? []) as any[])
    .map((m) => ({
      ...m,
      items: (m.items ?? []).sort(byOrder),
      // the notes embed on meals returns notes whose meal_id matches this meal
      notes: ((m.notes ?? []) as MenuSpecialNoteRow[]).sort(byOrder),
    }))
    .sort(byOrder)

  // The day-level embed returns ALL notes for the day — keep only meal_id null
  const day_notes = ((data.day_notes ?? []) as MenuSpecialNoteRow[])
    .filter((n) => n.meal_id === null)
    .sort(byOrder)

  return { ...data, menu_meals: undefined, meals, day_notes } as MenuDayFull
}

/** Dish picker search — usage-ranked. With no query returns the top dishes;
 *  with a query, filters the (small) catalog in memory so English spellings
 *  find Bangla names via transliteration (e.g. "kola" → কলা). */
export async function searchDishCatalog(query: string, category?: string): Promise<MenuDishRow[]> {
  const trimmed = query.trim()

  let q = dbc()
    .from('menu_dish_catalog')
    .select('*')
    .eq('is_active', true)
    .order('usage_count', { ascending: false })
    .order('name', { ascending: true })
    // No query → top 20 (DB-limited). With a query → pull the catalog and
    // filter locally; it's ~100s of rows, well under the PostgREST cap.
    .limit(trimmed ? 500 : 20)

  if (category) q = q.eq('category', category)

  const { data, error } = await q
  if (error) throw new Error(`searchDishCatalog: ${error.message}`)
  const rows = (data ?? []) as MenuDishRow[]

  if (!trimmed) return rows
  return rows.filter((d) => dishSearchMatches(d.name, trimmed)).slice(0, 20)
}

export async function listMealTypes(): Promise<MenuMealTypeRow[]> {
  const { data, error } = await dbc()
    .from('menu_meal_types')
    .select('*')
    .eq('is_active', true)
    .order('display_order', { ascending: true })
  if (error) throw new Error(`listMealTypes: ${error.message}`)
  return (data ?? []) as MenuMealTypeRow[]
}

export async function listTemplates(mealTypeId?: string): Promise<MenuTemplateRow[]> {
  let q = dbc().from('menu_templates').select('*').order('name', { ascending: true })
  if (mealTypeId) q = q.eq('meal_type_id', mealTypeId)
  const { data, error } = await q
  if (error) throw new Error(`listTemplates: ${error.message}`)
  return (data ?? []) as MenuTemplateRow[]
}

/** Prefill for "create from booking". Locked mapping:
 *  adults ← adults, children ← children_paid + children_free,
 *  drivers ← drivers, total ← sum of the three (prefill only, no recompute),
 *  occasion_note ← customer_name. Confirmed bookings only — filtered
 *  explicitly so future status additions never leak in. */
export async function getBookingPrefill(bookingId: string): Promise<MenuBookingPrefill | null> {
  const { data, error } = await dbc()
    .from('bookings')
    .select('id, booking_number, customer_name, visit_date, status, adults, children_paid, children_free, drivers')
    .eq('id', bookingId)
    .eq('status', 'confirmed')
    .maybeSingle()
  if (error) throw new Error(`getBookingPrefill: ${error.message}`)
  if (!data) return null

  const adults   = Number(data.adults ?? 0)
  const children = Number(data.children_paid ?? 0) + Number(data.children_free ?? 0)
  const drivers  = Number(data.drivers ?? 0)
  return {
    booking_id:     data.id,
    booking_number: data.booking_number,
    customer_name:  data.customer_name,
    visit_date:     data.visit_date,
    adults,
    children,
    drivers,
    total: adults + children + drivers,
  }
}

export interface DayMealCount {
  adults:   number
  children: number
  drivers:  number
  total:    number   // adults + children + drivers (prefill only — editable, never recomputed after)
  bookings: number   // how many bookings contribute
}

/** Per-meal-type expected headcounts, keyed by meal type slug. Slugs with no
 *  calculation basis (light_morning_snack) are absent. */
export type DayMealHeadcounts = Partial<Record<string, DayMealCount>>

/**
 * Day-wide meal headcounts from ALL bookings covering `date` — a menu day
 * feeds everyone on site, not one booking. Reuses the daily-report meal
 * engine (lib/engine/meals.ts) so both screens always agree:
 *
 *   welcome_drinks  → everyone checking IN that day (daylong + night arrivals)
 *   breakfast       → overnight guests waking up that day (incl. checkout-morning)
 *                     + daylong packages that include breakfast
 *   lunch           → daylong guests + arriving/staying night guests
 *   afternoon_snack → packages that include snacks (typically daylong)
 *   dinner          → night guests in-house that night
 *
 * Drivers ride along with whichever meals their booking participates in.
 */
export async function getDayMealHeadcounts(date: string): Promise<DayMealHeadcounts> {
  const { data, error } = await dbc()
    .from('bookings')
    .select('package_type, visit_date, check_out_date, status, adults, children_paid, children_free, drivers, package_snapshot')
    .neq('status', 'cancelled')
    .neq('status', 'no_show')
    .lte('visit_date', date)
  if (error) throw new Error(`getDayMealHeadcounts: ${error.message}`)

  const empty = (): DayMealCount => ({ adults: 0, children: 0, drivers: 0, total: 0, bookings: 0 })
  const acc: Record<string, DayMealCount> = {
    welcome_drinks:  empty(),
    breakfast:       empty(),
    lunch:           empty(),
    afternoon_snack: empty(),
    dinner:          empty(),
  }

  const add = (slug: string, b: { adults: number; children: number; drivers: number }) => {
    const c = acc[slug]
    c.adults   += b.adults
    c.children += b.children
    c.drivers  += b.drivers
    c.total    += b.adults + b.children + b.drivers
    c.bookings += 1
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const booking of (data ?? []) as any[]) {
    const counts = {
      adults:   Number(booking.adults ?? 0),
      children: Number(booking.children_paid ?? 0) + Number(booking.children_free ?? 0),
      drivers:  Number(booking.drivers ?? 0),
    }

    // Welcome drinks — arrivals of the day, regardless of package type
    if (booking.visit_date === date) add('welcome_drinks', counts)

    const snap = booking.package_snapshot ?? {}
    const meals = getMealsForBookingOnDate(
      {
        package_type:       booking.package_type,
        visit_date:         booking.visit_date,
        check_out_date:     booking.check_out_date,
        adults:             booking.adults ?? 0,
        children_paid:      booking.children_paid ?? 0,
        children_free:      booking.children_free ?? 0,
        includes_breakfast: snap.includes_breakfast,
        includes_lunch:     snap.includes_lunch,
        includes_dinner:    snap.includes_dinner,
        includes_snacks:    snap.includes_snacks,
      },
      date,
    )

    if (meals.breakfast > 0) add('breakfast', counts)
    if (meals.lunch     > 0) add('lunch', counts)
    if (meals.snacks    > 0) add('afternoon_snack', counts)
    if (meals.dinner    > 0) add('dinner', counts)
  }

  return acc
}

/** Confirmed bookings for the "create from booking" picker (visit_date shown
 *  so the right event is obvious). Upcoming + last 7 days. */
export async function listBookingsForMenuPicker(): Promise<Array<{
  id: string; booking_number: string; customer_name: string; visit_date: string
}>> {
  const from = new Date()
  from.setDate(from.getDate() - 7)
  const { data, error } = await dbc()
    .from('bookings')
    .select('id, booking_number, customer_name, visit_date')
    .eq('status', 'confirmed')
    .gte('visit_date', from.toISOString().split('T')[0])
    .order('visit_date', { ascending: true })
    .limit(100)
  if (error) throw new Error(`listBookingsForMenuPicker: ${error.message}`)
  return data ?? []
}
