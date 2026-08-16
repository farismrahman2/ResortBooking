'use server'

import { revalidatePath, revalidateTag } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { ActionResult, ActionData } from './types'
import { requirePermission } from '@/lib/auth/permissions'

/** Keys the settings form is allowed to write, with a sanity check per value.
 *  Without this, any authenticated settings-writer could store any key/value —
 *  including garbage in keys the pricing engine reads as numbers. */
const text = (max: number) => (v: string) => v.length <= max
const SETTING_RULES: Record<string, (v: string) => boolean> = {
  total_rooms:          (v) => Number.isInteger(Number(v)) && Number(v) > 0 && Number(v) <= 500,
  payment_instructions: text(2000),
  contact_numbers:      text(500),
  default_notes:        text(2000),
  whatsapp_footer_text: text(1000),
}

/** Create or update a settings key-value pair */
export async function upsertSetting(key: string, value: string): Promise<ActionResult> {
  await requirePermission('settings', 'write')
  try {
    const rule = SETTING_RULES[key]
    if (!rule) return { success: false, error: `Unknown setting "${key}"` }
    if (!rule(value)) return { success: false, error: `Invalid value for ${key.replace(/_/g, ' ')}` }
    const supabase = createClient()
    const { error } = await supabase
      .from('settings')
      .upsert({ key, value }, { onConflict: 'key' })

    if (error) return { success: false, error: error.message }

    revalidateTag('settings')
    revalidateTag('holiday-dates')
    revalidatePath('/settings')
    return { success: true }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

/** Upsert multiple settings at once */
export async function upsertSettings(
  settings: Record<string, string>,
): Promise<ActionResult> {
  await requirePermission('settings', 'write')
  try {
    for (const [key, value] of Object.entries(settings)) {
      const rule = SETTING_RULES[key]
      if (!rule) return { success: false, error: `Unknown setting "${key}"` }
      if (!rule(value)) return { success: false, error: `Invalid value for ${key.replace(/_/g, ' ')}` }
    }
    const supabase = createClient()
    const rows = Object.entries(settings).map(([key, value]) => ({ key, value }))
    const { error } = await supabase
      .from('settings')
      .upsert(rows, { onConflict: 'key' })

    if (error) return { success: false, error: error.message }

    revalidateTag('settings')
    revalidateTag('holiday-dates')
    revalidatePath('/settings')
    return { success: true }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

/** Add a new holiday date */
export async function addHolidayDate(date: string, label: string): Promise<ActionData<{ id: string }>> {
  await requirePermission('settings', 'write')
  try {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { success: false, error: 'Pick a valid date' }
    if (!label.trim()) return { success: false, error: 'Label is required' }
    const supabase = createClient()
    // Return the real id so the client can swap out its optimistic temp row —
    // otherwise a just-added holiday kept a temp id and could not be deleted
    // until a full page reload.
    const { data, error } = await supabase
      .from('holiday_dates')
      .insert({ date, label: label.trim() })
      .select('id')
      .single()

    if (error || !data) return { success: false, error: error?.message ?? 'Insert failed' }

    revalidateTag('settings')
    revalidateTag('holiday-dates')
    revalidatePath('/settings')
    return { success: true, data: { id: data.id } }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

/** Delete a holiday date by ID */
export async function deleteHolidayDate(id: string): Promise<ActionResult> {
  await requirePermission('settings', 'write')
  try {
    const supabase = createClient()
    const { error } = await supabase
      .from('holiday_dates')
      .delete()
      .eq('id', id)

    if (error) return { success: false, error: error.message }

    revalidateTag('settings')
    revalidateTag('holiday-dates')
    revalidatePath('/settings')
    return { success: true }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}
