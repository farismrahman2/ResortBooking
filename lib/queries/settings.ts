import { cachedRef } from '@/lib/cache'
import type { SettingRow, HolidayDateRow, RoomInventoryRow, SettingsMap } from '@/lib/supabase/types'

/** Fetch all settings as a key-value map. Cached — invalidated by `updateSettings`. */
export const getSettings = cachedRef<SettingsMap>(
  'settings',
  async (db) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (db as any).from('settings').select('*')
    if (error) throw new Error(`getSettings: ${error.message}`)
    const map: SettingsMap = {}
    for (const row of (data ?? []) as SettingRow[]) map[row.key] = row.value
    return map
  },
  { tags: ['settings'], revalidate: 300 },
)

/** Fetch all holiday dates, sorted by date. Cached — invalidated by holiday CRUD. */
export const getHolidayDates = cachedRef<HolidayDateRow[]>(
  'holiday-dates',
  async (db) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (db as any)
      .from('holiday_dates').select('*').order('date', { ascending: true })
    if (error) throw new Error(`getHolidayDates: ${error.message}`)
    return (data ?? []) as HolidayDateRow[]
  },
  { tags: ['holiday-dates'], revalidate: 300 },
)

/** Fetch holiday date strings only (for calculator). Cached. */
export const getHolidayDateStrings = cachedRef<string[]>(
  'holiday-date-strings',
  async (db) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (db as any)
      .from('holiday_dates').select('date').order('date', { ascending: true })
    if (error) throw new Error(`getHolidayDateStrings: ${error.message}`)
    return ((data ?? []) as { date: string }[]).map((d) => d.date)
  },
  { tags: ['holiday-dates'], revalidate: 300 },
)

/** Fetch all room inventory. Cached — basically static. */
export const getRoomInventory = cachedRef<RoomInventoryRow[]>(
  'room-inventory',
  async (db) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (db as any)
      .from('room_inventory').select('*').order('display_order', { ascending: true })
    if (error) throw new Error(`getRoomInventory: ${error.message}`)
    return (data ?? []) as RoomInventoryRow[]
  },
  { tags: ['room-inventory'], revalidate: 600 },   // 10 min — never really changes
)
