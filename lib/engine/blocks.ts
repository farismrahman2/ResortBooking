/**
 * ROOM BLOCKS — rooms taken off sale for a date range.
 *
 * A block is turned into what the availability engine already understands:
 * on every date it is active, a one-night stay holding the blocked rooms.
 * A one-night stay takes both halves of its check-in date and nothing of
 * the next, so a block on a date occupies exactly that whole day. Every
 * check, picker and calendar that respects bookings therefore respects
 * blocks too, with no second rule to forget.
 *
 * Scope is resolved at check time, not when the block is saved: "all
 * Premium Deluxe Canopy" means every room of that type as configured today,
 * and "the whole property" means every physical room. A composite (the
 * villa) is blocked through its component rooms.
 *
 * Pure functions, no I/O.
 */

import { ROOM_NUMBERS, ROOM_NUMBER_TO_TYPE, COMPOSITE_ROOMS, isComposite } from '@/lib/config/rooms'
import { addDaysIso } from '@/lib/dates'
import { occupancyOnDate, type StayLike, type StayRoom } from './halves'
import type { RoomType } from '@/lib/supabase/types'

export const BLOCK_REASONS = [
  { value: 'not_open',     label: 'Not yet open' },
  { value: 'maintenance',  label: 'Maintenance / repair' },
  { value: 'renovation',   label: 'Renovation' },
  { value: 'private_event', label: 'Private event' },
  { value: 'owner_use',    label: "Owner's use" },
  { value: 'staff_use',    label: 'Staff use' },
  { value: 'other',        label: 'Other' },
] as const
export type BlockReasonKind = typeof BLOCK_REASONS[number]['value']

export const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

export interface RoomBlock {
  id:           string
  /** The whole property — every physical room. */
  all_rooms:    boolean
  /** Whole room types. */
  room_types:   string[]
  /** Specific rooms. All three scopes may be combined in one block. */
  room_numbers: string[]
  start_date:   string
  /** Inclusive. null = until further notice. */
  end_date:     string | null
  /** 0 = Sunday … 6 = Saturday. null or empty = every day in the range. */
  weekdays:     number[] | null
  reason_kind:  string
  reason:       string | null
}

export type InventoryUnits = ReadonlyArray<{ room_type: string; total_units: number }>

export function reasonLabel(b: Pick<RoomBlock, 'reason_kind' | 'reason'>): string {
  const kind = BLOCK_REASONS.find((r) => r.value === b.reason_kind)?.label ?? 'Blocked'
  return b.reason?.trim() ? `${kind} — ${b.reason.trim()}` : kind
}

/** Is the block in force on this date? */
export function blockActiveOn(b: RoomBlock, date: string): boolean {
  if (date < b.start_date) return false
  if (b.end_date && date > b.end_date) return false
  if (b.weekdays && b.weekdays.length > 0) {
    const dow = new Date(date + 'T12:00:00Z').getUTCDay()
    if (!b.weekdays.includes(dow)) return false
  }
  return true
}

/**
 * The physical rooms a block holds, one entry per room type. Numbered types
 * carry their numbers; types without fixed numbers (the tree house) are
 * blocked as a count of every unit.
 */
export function blockedRooms(b: RoomBlock, inventory: InventoryUnits): StayRoom[] {
  const byType = new Map<string, { nums: Set<string>; count: number }>()
  const add = (type: string, nums: string[], count = 0) => {
    const cur = byType.get(type) ?? { nums: new Set<string>(), count: 0 }
    for (const n of nums) cur.nums.add(n)
    cur.count = Math.max(cur.count, count)
    byType.set(type, cur)
  }
  const addType = (type: string) => {
    const comp = COMPOSITE_ROOMS[type as RoomType]
    if (comp) return add(comp.component_type, comp.room_numbers)
    const nums = ROOM_NUMBERS[type as RoomType] ?? []
    if (nums.length) return add(type, nums)
    const units = inventory.find((i) => i.room_type === type)?.total_units ?? 0
    if (units > 0) add(type, [], units)
  }

  if (b.all_rooms) for (const inv of inventory) if (!isComposite(inv.room_type)) addType(inv.room_type)
  for (const t of b.room_types) addType(t)
  for (const n of b.room_numbers) {
    const t = ROOM_NUMBER_TO_TYPE[n]
    if (t) add(t, [n])
  }

  const out: StayRoom[] = []
  for (const [room_type, v] of byType) {
    const nums = [...v.nums].sort()
    const qty = nums.length > 0 ? nums.length : v.count
    if (qty > 0) out.push({ room_type, qty, room_numbers: nums })
  }
  return out
}

/** Stays standing in for the blocks over [from, to): one per active date. */
export function blockStays(blocks: RoomBlock[], from: string, to: string, inventory: InventoryUnits): StayLike[] {
  const out: StayLike[] = []
  for (const b of blocks) {
    const rooms = blockedRooms(b, inventory)
    if (rooms.length === 0) continue
    const start = b.start_date > from ? b.start_date : from
    for (let d = start; d < to; d = addDaysIso(d, 1)) {
      if (b.end_date && d > b.end_date) break
      if (!blockActiveOn(b, d)) continue
      out.push({
        package_type: 'night', visit_date: d, check_out_date: addDaysIso(d, 1), rooms,
        block: { id: b.id, reason: reasonLabel(b) },
      })
    }
  }
  return out
}

/** Every date a stay holds a room on. */
function stayDates(s: StayLike): string[] {
  if (s.package_type === 'daylong' || !s.check_out_date) return [s.visit_date]
  const out: string[] = []
  for (let d = s.visit_date; d < s.check_out_date; d = addDaysIso(d, 1)) out.push(d)
  return out
}

export interface BlockConflict { ref: string; date: string; rooms: string[] }

/**
 * Bookings and confirmed quotes that already hold something the block would
 * take. A block is refused while any exist — it never moves a guest.
 *
 * A booking that names its rooms conflicts when it names a blocked one. One
 * that holds a numbered type by count only conflicts when the block takes
 * every room of that type; a type without numbers conflicts outright.
 */
export function findBlockConflicts(b: RoomBlock, stays: StayLike[], inventory: InventoryUnits): BlockConflict[] {
  const held = blockedRooms(b, inventory)
  const nums = new Set(held.flatMap((r) => r.room_numbers))
  const wholeType = new Set(held
    .filter((r) => {
      const all = ROOM_NUMBERS[r.room_type as RoomType] ?? []
      return all.length === 0 || all.every((n) => nums.has(n))
    })
    .map((r) => r.room_type))

  const out: BlockConflict[] = []
  for (const s of stays) {
    if (s.block) continue
    for (const date of stayDates(s)) {
      if (!blockActiveOn(b, date)) continue
      const hit: string[] = []
      for (const rec of occupancyOnDate(s, date)) {
        const named = rec.room_numbers.filter((n) => nums.has(n))
        if (named.length) hit.push(...named)
        else if (rec.room_numbers.length === 0 && wholeType.has(rec.room_type)) hit.push(rec.room_type.replace(/_/g, ' '))
      }
      if (hit.length) out.push({ ref: s.ref ?? 'a booking', date, rooms: [...new Set(hit)] })
    }
  }
  return out
}

/** Physical room units blocked on a date — for occupancy against sellable rooms. */
export function blockedUnitsOn(blocks: RoomBlock[], date: string, inventory: InventoryUnits): number {
  const nums = new Set<string>()
  const counts = new Map<string, number>()
  for (const b of blocks) {
    if (!blockActiveOn(b, date)) continue
    for (const r of blockedRooms(b, inventory)) {
      if (r.room_numbers.length) r.room_numbers.forEach((n) => nums.add(n))
      else counts.set(r.room_type, Math.max(counts.get(r.room_type) ?? 0, r.qty))
    }
  }
  return nums.size + [...counts.values()].reduce((s, n) => s + n, 0)
}

/** Room numbers blocked on any of these dates, with why — for the pickers. */
export function blockedNumbersOn(blocks: RoomBlock[], dates: string[], inventory: InventoryUnits): Record<string, string> {
  const out: Record<string, string> = {}
  for (const b of blocks) {
    if (!dates.some((d) => blockActiveOn(b, d))) continue
    const why = reasonLabel(b)
    for (const r of blockedRooms(b, inventory)) for (const n of r.room_numbers) out[n] ??= why
  }
  return out
}
