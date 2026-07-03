'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { checkPermission, getCurrentUserContext, isAdmin } from '@/lib/auth/permissions'
import {
  menuDayFormSchema, menuDayUpdateSchema, mealFormSchema, mealUpdateSchema,
  setMealItemsSchema, specialNoteSchema, specialNoteUpdateSchema, templateSchema,
  type MenuDayFormInput, type MenuDayUpdateInput, type MealFormInput, type MealUpdateInput,
  type SetMealItemsInput, type SpecialNoteInput, type SpecialNoteUpdate, type TemplateInput,
} from '@/lib/validators/menus'
import { getBookingPrefill } from '@/lib/queries/menus'
import type { ActionResult, ActionData } from './types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const dbc = () => createClient() as any

async function logHistory(id: string, event: 'created' | 'edited' | 'status_changed', payload: Record<string, unknown> = {}) {
  try {
    const { error } = await dbc().from('history_log').insert({
      entity_type: 'menu_day', entity_id: id, event, actor: 'system', payload,
    })
    if (error) console.warn(`[history_log] non-fatal: ${error.message}`)
  } catch (err) {
    console.warn('[history_log] non-fatal:', err)
  }
}

function revalidateMenus(dayId?: string) {
  revalidatePath('/menus')
  if (dayId) revalidatePath(`/menus/${dayId}`)
}

/** Guard: the day exists and is still a draft (finalized menus lock). */
async function assertDraftDay(dayId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data } = await dbc().from('menu_days').select('id, status').eq('id', dayId).maybeSingle()
  if (!data) return { ok: false, error: 'Menu day not found' }
  if (data.status !== 'draft') return { ok: false, error: 'This menu is finalized — reopen it first (admin)' }
  return { ok: true }
}

/** Same guard, resolved from a meal id. Returns the day id on success. */
async function assertDraftByMeal(mealId: string): Promise<{ ok: true; dayId: string } | { ok: false; error: string }> {
  const { data } = await dbc()
    .from('menu_meals')
    .select('id, menu_day_id, day:menu_days!inner(status)')
    .eq('id', mealId)
    .maybeSingle()
  if (!data) return { ok: false, error: 'Meal not found' }
  const status = Array.isArray(data.day) ? data.day[0]?.status : data.day?.status
  if (status !== 'draft') return { ok: false, error: 'This menu is finalized — reopen it first (admin)' }
  return { ok: true, dayId: data.menu_day_id }
}

// ─── Menu days ────────────────────────────────────────────────────────────────

/** Create a menu day — standalone, or from a confirmed booking. When a
 *  booking_id is supplied the server re-reads the booking for the prefill
 *  (occasion ← customer name) rather than trusting client-sent values. */
export async function createMenuDay(raw: MenuDayFormInput): Promise<ActionData<{ id: string }>> {
  const perm = await checkPermission('menus', 'write')
  if (!perm.success) return { success: false, error: perm.error }

  try {
    const input = menuDayFormSchema.parse(raw)
    const db = dbc()
    const ctx = await getCurrentUserContext()

    let menu_date     = input.menu_date
    let occasion_note = input.occasion_note ?? null
    let booking_id: string | null = null

    if (input.booking_id) {
      const prefill = await getBookingPrefill(input.booking_id)
      if (!prefill) return { success: false, error: 'Booking not found or not confirmed' }
      booking_id = prefill.booking_id
      // Client-sent values win only when explicitly provided (both editable)
      menu_date     = input.menu_date || prefill.visit_date
      occasion_note = input.occasion_note ?? prefill.customer_name
    }

    const { data, error } = await db
      .from('menu_days')
      .insert({ menu_date, occasion_note, booking_id, created_by: ctx?.user_id ?? null })
      .select('id')
      .single()
    if (error) return { success: false, error: error.message }

    await logHistory(data.id, 'created', { menu_date, booking_id })
    revalidateMenus()
    return { success: true, data: { id: data.id } }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to create menu day' }
  }
}

export async function updateMenuDay(raw: MenuDayUpdateInput): Promise<ActionResult> {
  const perm = await checkPermission('menus', 'write')
  if (!perm.success) return perm

  try {
    const input = menuDayUpdateSchema.parse(raw)
    const draft = await assertDraftDay(input.id)
    if (!draft.ok) return { success: false, error: draft.error }

    const patch: Record<string, unknown> = {}
    if (input.menu_date !== undefined)     patch.menu_date = input.menu_date
    if (input.occasion_note !== undefined) patch.occasion_note = input.occasion_note?.trim() || null
    if (Object.keys(patch).length === 0) return { success: true }

    const { error } = await dbc().from('menu_days').update(patch).eq('id', input.id)
    if (error) return { success: false, error: error.message }

    await logHistory(input.id, 'edited', patch)
    revalidateMenus(input.id)
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to update menu day' }
  }
}

/** Delete a menu day — drafts only (finalized requires reopen first). */
export async function deleteMenuDay(id: string): Promise<ActionResult> {
  const perm = await checkPermission('menus', 'write')
  if (!perm.success) return perm

  const draft = await assertDraftDay(id)
  if (!draft.ok) return { success: false, error: draft.error }

  const { error } = await dbc().from('menu_days').delete().eq('id', id)
  if (error) return { success: false, error: error.message }

  revalidateMenus()
  return { success: true }
}

export async function finalizeMenuDay(id: string): Promise<ActionResult> {
  const perm = await checkPermission('menus', 'write')
  if (!perm.success) return perm

  const draft = await assertDraftDay(id)
  if (!draft.ok) return { success: false, error: draft.error }

  const ctx = await getCurrentUserContext()
  const { error } = await dbc()
    .from('menu_days')
    .update({ status: 'finalized', finalized_at: new Date().toISOString(), finalized_by: ctx?.user_id ?? null })
    .eq('id', id)
    .eq('status', 'draft')
  if (error) return { success: false, error: error.message }

  await logHistory(id, 'status_changed', { to: 'finalized' })
  revalidateMenus(id)
  return { success: true }
}

/** Reopen a finalized menu — admin only (defense-in-depth server check). */
export async function reopenMenuDay(id: string): Promise<ActionResult> {
  const perm = await checkPermission('menus', 'write')
  if (!perm.success) return perm
  if (!(await isAdmin())) return { success: false, error: 'Only an admin can reopen a finalized menu' }

  const { error } = await dbc()
    .from('menu_days')
    .update({ status: 'draft', finalized_at: null, finalized_by: null })
    .eq('id', id)
    .eq('status', 'finalized')
  if (error) return { success: false, error: error.message }

  await logHistory(id, 'status_changed', { to: 'draft' })
  revalidateMenus(id)
  return { success: true }
}

// ─── Meals ────────────────────────────────────────────────────────────────────

export async function addMeal(raw: MealFormInput): Promise<ActionData<{ id: string }>> {
  const perm = await checkPermission('menus', 'write')
  if (!perm.success) return { success: false, error: perm.error }

  try {
    const input = mealFormSchema.parse(raw)
    const draft = await assertDraftDay(input.menu_day_id)
    if (!draft.ok) return { success: false, error: draft.error }

    const db = dbc()

    // Default serving time from the meal type when none supplied
    let serving_time = input.serving_time ?? null
    if (serving_time == null) {
      const { data: mt } = await db
        .from('menu_meal_types').select('default_serving_time').eq('id', input.meal_type_id).maybeSingle()
      serving_time = mt?.default_serving_time ?? null
    }

    const { data: last } = await db
      .from('menu_meals')
      .select('display_order')
      .eq('menu_day_id', input.menu_day_id)
      .order('display_order', { ascending: false })
      .limit(1)
      .maybeSingle()

    const { data, error } = await db
      .from('menu_meals')
      .insert({
        menu_day_id:        input.menu_day_id,
        meal_type_id:       input.meal_type_id,
        serving_time,
        headcount_total:    input.headcount_total ?? null,
        headcount_adults:   input.headcount_adults ?? null,
        headcount_children: input.headcount_children ?? null,
        headcount_drivers:  input.headcount_drivers ?? null,
        display_order:      (last?.display_order ?? -1) + 1,
      })
      .select('id')
      .single()
    if (error) return { success: false, error: error.message }

    await logHistory(input.menu_day_id, 'edited', { added_meal: data.id })
    revalidateMenus(input.menu_day_id)
    return { success: true, data: { id: data.id } }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to add meal' }
  }
}

export async function updateMeal(raw: MealUpdateInput): Promise<ActionResult> {
  const perm = await checkPermission('menus', 'write')
  if (!perm.success) return perm

  try {
    const input = mealUpdateSchema.parse(raw)
    const draft = await assertDraftByMeal(input.id)
    if (!draft.ok) return { success: false, error: draft.error }

    const patch: Record<string, unknown> = {}
    if (input.serving_time !== undefined)       patch.serving_time = input.serving_time?.trim() || null
    if (input.headcount_total !== undefined)    patch.headcount_total = input.headcount_total
    if (input.headcount_adults !== undefined)   patch.headcount_adults = input.headcount_adults
    if (input.headcount_children !== undefined) patch.headcount_children = input.headcount_children
    if (input.headcount_drivers !== undefined)  patch.headcount_drivers = input.headcount_drivers
    if (Object.keys(patch).length === 0) return { success: true }

    const { error } = await dbc().from('menu_meals').update(patch).eq('id', input.id)
    if (error) return { success: false, error: error.message }

    revalidateMenus(draft.dayId)
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to update meal' }
  }
}

export async function removeMeal(mealId: string): Promise<ActionResult> {
  const perm = await checkPermission('menus', 'write')
  if (!perm.success) return perm

  const draft = await assertDraftByMeal(mealId)
  if (!draft.ok) return { success: false, error: draft.error }

  const { error } = await dbc().from('menu_meals').delete().eq('id', mealId)
  if (error) return { success: false, error: error.message }

  revalidateMenus(draft.dayId)
  return { success: true }
}

export async function reorderMeals(menuDayId: string, orderedMealIds: string[]): Promise<ActionResult> {
  const perm = await checkPermission('menus', 'write')
  if (!perm.success) return perm

  const draft = await assertDraftDay(menuDayId)
  if (!draft.ok) return { success: false, error: draft.error }

  const db = dbc()
  for (let i = 0; i < orderedMealIds.length; i++) {
    const { error } = await db
      .from('menu_meals')
      .update({ display_order: i })
      .eq('id', orderedMealIds[i])
      .eq('menu_day_id', menuDayId)
    if (error) return { success: false, error: error.message }
  }

  revalidateMenus(menuDayId)
  return { success: true }
}

// ─── Meal items (replace-all, coffee-shop precedent) ──────────────────────────

export async function setMealItems(raw: SetMealItemsInput): Promise<ActionResult> {
  const perm = await checkPermission('menus', 'write')
  if (!perm.success) return perm

  try {
    const input = setMealItemsSchema.parse(raw)
    const draft = await assertDraftByMeal(input.meal_id)
    if (!draft.ok) return { success: false, error: draft.error }

    const db = dbc()

    const { error: delErr } = await db.from('menu_meal_items').delete().eq('meal_id', input.meal_id)
    if (delErr) return { success: false, error: delErr.message }

    if (input.items.length > 0) {
      const rows = input.items.map((item, i) => ({
        meal_id:         input.meal_id,
        text:            item.text.trim(),
        dish_catalog_id: item.dish_catalog_id ?? null,
        display_order:   i,
      }))
      const { error: insErr } = await db.from('menu_meal_items').insert(rows)
      if (insErr) return { success: false, error: insErr.message }

      // Usage ranking for the picker — one bump per distinct catalog dish used
      const catalogIds = [...new Set(rows.map((r) => r.dish_catalog_id).filter(Boolean))] as string[]
      for (const id of catalogIds) {
        const { data: dish } = await db.from('menu_dish_catalog').select('usage_count').eq('id', id).maybeSingle()
        if (dish) await db.from('menu_dish_catalog').update({ usage_count: dish.usage_count + 1 }).eq('id', id)
      }
    }

    revalidateMenus(draft.dayId)
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to save dishes' }
  }
}

/** "+ Add to catalog" — one-tap save of a free-text dish. */
export async function addDishToCatalog(name: string, category?: string): Promise<ActionData<{ id: string }>> {
  const perm = await checkPermission('menus', 'write')
  if (!perm.success) return { success: false, error: perm.error }

  const trimmed = name.trim()
  if (!trimmed) return { success: false, error: 'Dish name required' }

  const db = dbc()
  const { data: existing } = await db.from('menu_dish_catalog').select('id').eq('name', trimmed).maybeSingle()
  if (existing) return { success: true, data: { id: existing.id } }

  const { data, error } = await db
    .from('menu_dish_catalog')
    .insert({ name: trimmed, category: category?.trim() || null })
    .select('id')
    .single()
  if (error) return { success: false, error: error.message }
  return { success: true, data: { id: data.id } }
}

// ─── Special notes ────────────────────────────────────────────────────────────

export async function addSpecialNote(raw: SpecialNoteInput): Promise<ActionResult> {
  const perm = await checkPermission('menus', 'write')
  if (!perm.success) return perm

  try {
    const input = specialNoteSchema.parse(raw)
    const draft = await assertDraftDay(input.menu_day_id)
    if (!draft.ok) return { success: false, error: draft.error }

    const db = dbc()
    const { data: last } = await db
      .from('menu_special_notes')
      .select('display_order')
      .eq('menu_day_id', input.menu_day_id)
      .order('display_order', { ascending: false })
      .limit(1)
      .maybeSingle()

    const { error } = await db.from('menu_special_notes').insert({
      menu_day_id:   input.menu_day_id,
      meal_id:       input.meal_id ?? null,
      text:          input.text.trim(),
      color:         input.color,
      display_order: (last?.display_order ?? -1) + 1,
    })
    if (error) return { success: false, error: error.message }

    revalidateMenus(input.menu_day_id)
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to add note' }
  }
}

export async function updateSpecialNote(raw: SpecialNoteUpdate): Promise<ActionResult> {
  const perm = await checkPermission('menus', 'write')
  if (!perm.success) return perm

  try {
    const input = specialNoteUpdateSchema.parse(raw)
    const db = dbc()

    const { data: note } = await db
      .from('menu_special_notes').select('id, menu_day_id').eq('id', input.id).maybeSingle()
    if (!note) return { success: false, error: 'Note not found' }
    const draft = await assertDraftDay(note.menu_day_id)
    if (!draft.ok) return { success: false, error: draft.error }

    const patch: Record<string, unknown> = {}
    if (input.text !== undefined)  patch.text = input.text.trim()
    if (input.color !== undefined) patch.color = input.color
    if (Object.keys(patch).length === 0) return { success: true }

    const { error } = await db.from('menu_special_notes').update(patch).eq('id', input.id)
    if (error) return { success: false, error: error.message }

    revalidateMenus(note.menu_day_id)
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to update note' }
  }
}

export async function removeSpecialNote(id: string): Promise<ActionResult> {
  const perm = await checkPermission('menus', 'write')
  if (!perm.success) return perm

  const db = dbc()
  const { data: note } = await db.from('menu_special_notes').select('id, menu_day_id').eq('id', id).maybeSingle()
  if (!note) return { success: false, error: 'Note not found' }
  const draft = await assertDraftDay(note.menu_day_id)
  if (!draft.ok) return { success: false, error: draft.error }

  const { error } = await db.from('menu_special_notes').delete().eq('id', id)
  if (error) return { success: false, error: error.message }

  revalidateMenus(note.menu_day_id)
  return { success: true }
}

// ─── Templates (actions land in Phase 3; schema + validator ready) ────────────

export async function saveMealTemplate(raw: TemplateInput): Promise<ActionResult> {
  const perm = await checkPermission('menus', 'write')
  if (!perm.success) return perm

  try {
    const input = templateSchema.parse(raw)
    const ctx = await getCurrentUserContext()
    const { error } = await dbc().from('menu_templates').insert({
      name:         input.name,
      meal_type_id: input.meal_type_id,
      serving_time: input.serving_time ?? null,
      items:        input.items,
      created_by:   ctx?.user_id ?? null,
    })
    if (error) return { success: false, error: error.message }
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to save template' }
  }
}
