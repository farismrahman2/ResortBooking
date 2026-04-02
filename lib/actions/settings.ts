'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { ActionResult } from './types'

/** Create or update a settings key-value pair */
export async function upsertSetting(key: string, value: string): Promise<ActionResult> {
  try {
    const supabase = createClient()
    const { error } = await supabase
      .from('settings')
      .upsert({ key, value }, { onConflict: 'key' })

    if (error) return { success: false, error: error.message }

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
  try {
    const supabase = createClient()
    const rows = Object.entries(settings).map(([key, value]) => ({ key, value }))
    const { error } = await supabase
      .from('settings')
      .upsert(rows, { onConflict: 'key' })

    if (error) return { success: false, error: error.message }

    revalidatePath('/settings')
    return { success: true }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

/** Add a new holiday date */
export async function addHolidayDate(date: string, label: string): Promise<ActionResult> {
  try {
    const supabase = createClient()
    const { error } = await supabase
      .from('holiday_dates')
      .insert({ date, label })

    if (error) return { success: false, error: error.message }

    revalidatePath('/settings')
    return { success: true }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

/** Delete a holiday date by ID */
export async function deleteHolidayDate(id: string): Promise<ActionResult> {
  try {
    const supabase = createClient()
    const { error } = await supabase
      .from('holiday_dates')
      .delete()
      .eq('id', id)

    if (error) return { success: false, error: error.message }

    revalidatePath('/settings')
    return { success: true }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}
