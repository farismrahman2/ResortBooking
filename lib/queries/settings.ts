import { createClient } from '@/lib/supabase/server'
import type { SettingRow, HolidayDateRow, RoomInventoryRow, SettingsMap } from '@/lib/supabase/types'

/** Fetch all settings as a key-value map */
export async function getSettings(): Promise<SettingsMap> {
  const supabase = createClient()
  const { data, error } = await supabase.from('settings').select('*')
  if (error) throw new Error(`getSettings: ${error.message}`)

  const map: SettingsMap = {}
  for (const row of data ?? []) {
    map[row.key] = row.value
  }
  return map
}

/** Fetch all holiday dates, sorted by date */
export async function getHolidayDates(): Promise<HolidayDateRow[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('holiday_dates')
    .select('*')
    .order('date', { ascending: true })
  if (error) throw new Error(`getHolidayDates: ${error.message}`)
  return data ?? []
}

/** Fetch holiday date strings only (for calculator) */
export async function getHolidayDateStrings(): Promise<string[]> {
  const dates = await getHolidayDates()
  return dates.map((d) => d.date)
}

/** Fetch all room inventory */
export async function getRoomInventory(): Promise<RoomInventoryRow[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('room_inventory')
    .select('*')
    .order('display_order', { ascending: true })
  if (error) throw new Error(`getRoomInventory: ${error.message}`)
  return data ?? []
}
