/**
 * ROOM PRICES GRID — the rules, kept apart from the screen so they are tested.
 *
 * A cell is one package_room_prices row:
 *   a number  → the room's price on that package
 *   0         → "complimentary only": can be given free on a quote, never sold
 *   null      → no row, "not offered" (no price, not in the complimentary list)
 *   n/a       → cannot be priced: the conference room (priced per day on the
 *               quote) and day-only rooms (Tree House) on a night package
 *
 * Existing quotes and bookings keep the prices they were saved with — they
 * carry a snapshot — so changing a cell only affects new quotes, and rooms
 * whose quantity is changed on an open quote.
 */

import { isWholeDay } from '@/lib/config/rooms'

export type RoleSlug = string

/** May change prices — here and in the package form. */
export const PRICE_EDITOR_ROLES: readonly RoleSlug[] = ['admin', 'manager', 'md']
/** May look at the grid without changing it. */
export const PRICE_VIEWER_ROLES: readonly RoleSlug[] = [...PRICE_EDITOR_ROLES, 'accountant', 'operations_manager', 'reservation']

export const canEditPrices = (role: RoleSlug | undefined | null) => !!role && PRICE_EDITOR_ROLES.includes(role)
export const canViewPrices = (role: RoleSlug | undefined | null) => !!role && PRICE_VIEWER_ROLES.includes(role)

export type Cell = number | null

export const cellKey = (packageId: string, roomType: string) => `${packageId}|${roomType}`

export function isPriceable(
  roomType: string,
  packageType: 'daylong' | 'night',
  daylongOnly: boolean,
): boolean {
  if (isWholeDay(roomType)) return false
  if (packageType === 'night' && daylongOnly) return false
  return true
}

/** "5,200" → 5200; "" → null (not offered); anything else invalid → undefined. */
export function parseCell(text: string): Cell | undefined {
  const t = text.replace(/[,\s৳]/g, '')
  if (t === '') return null
  if (!/^\d+$/.test(t)) return undefined
  const n = Number(t)
  return Number.isSafeInteger(n) ? n : undefined
}

/** Add x% or ৳x, rounded to the nearest step. 0 and empty cells are left
 *  alone — a percentage of "complimentary" or "not offered" means nothing. */
export function adjustCell(value: Cell, mode: 'pct' | 'abs', amount: number, step: number): Cell {
  if (value === null || value === 0) return value
  const raw = mode === 'pct' ? value * (1 + amount / 100) : value + amount
  const rounded = step > 0 ? Math.round(raw / step) * step : Math.round(raw)
  return Math.max(0, rounded)
}

/** Copy one package's prices onto another, cell by cell. `onlyEmpty` fills
 *  only cells that are not offered yet. Cells the target cannot price are skipped. */
export function copyColumn(
  source: Record<string, Cell>,      // room_type → value on the source package
  target: Record<string, Cell>,      // room_type → value on the target package
  priceable: (roomType: string) => boolean,
  onlyEmpty: boolean,
): Record<string, Cell> {
  const out: Record<string, Cell> = {}
  for (const [roomType, v] of Object.entries(source)) {
    if (!priceable(roomType)) continue
    if (onlyEmpty && target[roomType] !== null && target[roomType] !== undefined) continue
    if (target[roomType] === v) continue
    out[roomType] = v
  }
  return out
}

export interface PriceChange {
  package_id: string
  room_type:  string
  /** New value; null removes the row (not offered). */
  price:      Cell
  /** What the editor saw — the save refuses if someone changed it since. */
  expected:   Cell
}

/** Percentage change, for the review dialog. null when it does not apply. */
export function pctChange(from: Cell, to: Cell): number | null {
  if (from === null || to === null || from === 0) return null
  return Math.round(((to - from) / from) * 100)
}

/** Worth a second look in the review: a big swing, a new ৳0, or a removal. */
export function needsAttention(from: Cell, to: Cell): boolean {
  if (to === null && from !== null) return true
  if (to === 0 && from !== 0) return true
  const p = pctChange(from, to)
  return p !== null && Math.abs(p) > 30
}
