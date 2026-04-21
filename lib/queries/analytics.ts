import { createClient } from '@/lib/supabase/server'
import type { RoomType } from '@/lib/supabase/types'

/**
 * ANALYTICS QUERIES
 *
 * All queries accept an ISO date range { from, to } INCLUSIVE on both ends
 * and reference `visit_date` (when the guest actually stays) as the revenue date,
 * not `created_at`. Cancelled bookings are excluded from every query.
 */

export interface DailyRevenueRow {
  date:          string
  booking_count: number
  subtotal:      number
  discount:      number
  total:         number
  collected:     number
  outstanding:   number
}

export interface PackageTypeStats {
  booking_count: number
  total:         number
  collected:     number
  outstanding:   number
}

export interface PackageTypeBreakdown {
  daylong: PackageTypeStats
  night:   PackageTypeStats
}

export interface RoomTypeUtilizationRow {
  room_type:          RoomType
  display_name:       string
  total_qty_booked:   number    // sum of qty
  total_room_nights:  number    // qty × nights (daylong → qty × 1)
  paid_revenue:       number    // qty × unit_price × nights where unit_price > 0
  comp_count:         number    // qty where unit_price === 0
  available_inventory: number
  utilization_pct:    number    // total_room_nights / (available_inventory × days_in_range)
}

export interface TotalsSummary {
  total_bookings:    number
  total_revenue:     number
  collected:         number
  outstanding:       number
  avg_booking_value: number
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function daysInRangeInclusive(from: string, to: string): number {
  const f = new Date(from + 'T00:00:00')
  const t = new Date(to   + 'T00:00:00')
  return Math.max(1, Math.round((t.getTime() - f.getTime()) / 86400000) + 1)
}

function isoDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

// ─── Totals Summary ──────────────────────────────────────────────────────────

export async function getTotalsSummary(from: string, to: string): Promise<TotalsSummary> {
  const supabase = createClient()
  const { data } = await supabase
    .from('bookings')
    .select('id, total, advance_paid, remaining')
    .gte('visit_date', from)
    .lte('visit_date', to)
    .neq('status', 'cancelled')

  const rows = data ?? []
  const total_bookings = rows.length
  const total_revenue  = rows.reduce((s, r: any) => s + (r.total ?? 0), 0)
  const collected      = rows.reduce((s, r: any) => s + (r.advance_paid ?? 0), 0)
  const outstanding    = rows.reduce((s, r: any) => s + (r.remaining ?? 0), 0)

  return {
    total_bookings,
    total_revenue,
    collected,
    outstanding,
    avg_booking_value: total_bookings > 0 ? Math.round(total_revenue / total_bookings) : 0,
  }
}

// ─── Daily Revenue ───────────────────────────────────────────────────────────

export async function getDailyRevenue(from: string, to: string): Promise<DailyRevenueRow[]> {
  const supabase = createClient()
  const { data } = await supabase
    .from('bookings')
    .select('visit_date, subtotal, discount, total, advance_paid, remaining')
    .gte('visit_date', from)
    .lte('visit_date', to)
    .neq('status', 'cancelled')

  // Aggregate by visit_date
  const map = new Map<string, DailyRevenueRow>()
  for (const row of (data ?? []) as any[]) {
    const d = row.visit_date as string
    const cur = map.get(d) ?? { date: d, booking_count: 0, subtotal: 0, discount: 0, total: 0, collected: 0, outstanding: 0 }
    cur.booking_count += 1
    cur.subtotal      += row.subtotal ?? 0
    cur.discount      += row.discount ?? 0
    cur.total         += row.total ?? 0
    cur.collected     += row.advance_paid ?? 0
    cur.outstanding   += row.remaining ?? 0
    map.set(d, cur)
  }

  // Fill zero-days across the full range so charts are continuous
  const result: DailyRevenueRow[] = []
  const cursor = new Date(from + 'T00:00:00')
  const end    = new Date(to   + 'T00:00:00')
  while (cursor <= end) {
    const d = isoDate(cursor)
    result.push(map.get(d) ?? { date: d, booking_count: 0, subtotal: 0, discount: 0, total: 0, collected: 0, outstanding: 0 })
    cursor.setDate(cursor.getDate() + 1)
  }
  return result
}

// ─── Package Type Breakdown ──────────────────────────────────────────────────

export async function getPackageTypeBreakdown(from: string, to: string): Promise<PackageTypeBreakdown> {
  const supabase = createClient()
  const { data } = await supabase
    .from('bookings')
    .select('package_type, total, advance_paid, remaining')
    .gte('visit_date', from)
    .lte('visit_date', to)
    .neq('status', 'cancelled')

  const empty = (): PackageTypeStats => ({ booking_count: 0, total: 0, collected: 0, outstanding: 0 })
  const out: PackageTypeBreakdown = { daylong: empty(), night: empty() }

  for (const row of (data ?? []) as any[]) {
    const bucket = row.package_type === 'night' ? out.night : out.daylong
    bucket.booking_count += 1
    bucket.total         += row.total ?? 0
    bucket.collected     += row.advance_paid ?? 0
    bucket.outstanding   += row.remaining ?? 0
  }

  return out
}

// ─── Room Type Utilization ───────────────────────────────────────────────────

export async function getRoomTypeUtilization(from: string, to: string): Promise<RoomTypeUtilizationRow[]> {
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  // Join booking_rooms → bookings, filter by visit_date range + non-cancelled
  const { data: rows } = await db
    .from('booking_rooms')
    .select('room_type, qty, unit_price, bookings!inner(visit_date, nights, status, package_type)')
    .gte('bookings.visit_date', from)
    .lte('bookings.visit_date', to)
    .neq('bookings.status', 'cancelled')

  // Inventory for denominator
  const { data: inv } = await db
    .from('room_inventory')
    .select('room_type, display_name, total_units')

  const days = daysInRangeInclusive(from, to)

  // Aggregate per room_type
  type Agg = {
    total_qty_booked:  number
    total_room_nights: number
    paid_revenue:      number
    comp_count:        number
  }
  const agg = new Map<string, Agg>()

  for (const row of (rows ?? []) as any[]) {
    const nights = row.bookings.nights ?? 1   // daylong has null nights; treat as 1
    const qty    = row.qty ?? 0
    const price  = row.unit_price ?? 0
    const cur = agg.get(row.room_type) ?? { total_qty_booked: 0, total_room_nights: 0, paid_revenue: 0, comp_count: 0 }
    cur.total_qty_booked  += qty
    cur.total_room_nights += qty * nights
    if (price > 0) cur.paid_revenue += qty * price * nights
    else cur.comp_count += qty
    agg.set(row.room_type, cur)
  }

  const result: RoomTypeUtilizationRow[] = []
  for (const invRow of (inv ?? []) as any[]) {
    const a = agg.get(invRow.room_type) ?? { total_qty_booked: 0, total_room_nights: 0, paid_revenue: 0, comp_count: 0 }
    const denom = (invRow.total_units ?? 0) * days
    result.push({
      room_type:           invRow.room_type,
      display_name:        invRow.display_name,
      total_qty_booked:    a.total_qty_booked,
      total_room_nights:   a.total_room_nights,
      paid_revenue:        a.paid_revenue,
      comp_count:          a.comp_count,
      available_inventory: invRow.total_units ?? 0,
      utilization_pct:     denom > 0 ? Math.round((a.total_room_nights / denom) * 1000) / 10 : 0,
    })
  }

  // Sort by revenue descending
  result.sort((a, b) => b.paid_revenue - a.paid_revenue)
  return result
}
