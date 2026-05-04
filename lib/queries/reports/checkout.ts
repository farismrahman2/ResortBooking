import { createServiceClient } from '@/lib/supabase/server'
import { unstable_cache } from 'next/cache'
import { toIsoDate } from '@/lib/reports/periods'
import type { PeriodRange } from '@/lib/reports/types'

const db = () => createServiceClient() as any  // eslint-disable-line @typescript-eslint/no-explicit-any

// ─── Extras revenue overview ────────────────────────────────────────────────

export interface ExtrasOverview {
  total_extras_revenue: number
  finalized_checkouts:  number
  total_guests:         number
  avg_extras_per_guest: number
  fb_revenue:           number   // food + beverage subset
  by_category:          Array<{ category: string; total: number; pct: number }>
  daily:                Array<{ date: string; total: number }>
}

export async function getExtrasOverview(period: PeriodRange): Promise<ExtrasOverview> {
  const fromIso = toIsoDate(period.from)
  const toIso   = toIsoDate(period.to)
  // Pull finalized checkouts and their charges
  const { data: checkouts } = await db()
    .from('checkouts')
    .select(`
      id, charges_total, finalized_at,
      booking:bookings!inner (adults, children_paid, children_free),
      checkout_charges (amount, category:charge_categories (slug, display_name))
    `)
    .eq('status', 'finalized')
    .gte('finalized_at', fromIso).lte('finalized_at', `${toIso}T23:59:59`)

  let total_extras_revenue = 0
  let total_guests = 0
  let fb_revenue = 0
  const byCategory = new Map<string, number>()
  const daily = new Map<string, number>()
  let d = new Date(period.from)
  while (d <= period.to) { daily.set(toIsoDate(d), 0); d = new Date(d.getTime() + 86400_000) }

  for (const co of (checkouts ?? []) as any[]) {  // eslint-disable-line @typescript-eslint/no-explicit-any
    const amt = Number(co.charges_total ?? 0)
    total_extras_revenue += amt
    const guests = Number(co.booking?.adults ?? 0) + Number(co.booking?.children_paid ?? 0) + Number(co.booking?.children_free ?? 0)
    total_guests += guests
    const day = String(co.finalized_at).slice(0, 10)
    daily.set(day, (daily.get(day) ?? 0) + amt)
    for (const ch of (co.checkout_charges ?? [])) {
      const slug = ch.category?.slug ?? 'misc'
      const name = ch.category?.display_name ?? 'Misc'
      byCategory.set(name, (byCategory.get(name) ?? 0) + Number(ch.amount ?? 0))
      if (slug === 'food' || slug === 'beverage' || slug === 'fnb') fb_revenue += Number(ch.amount ?? 0)
    }
  }

  const totalForPct = Array.from(byCategory.values()).reduce((s, v) => s + v, 0)
  return {
    total_extras_revenue,
    finalized_checkouts:  (checkouts ?? []).length,
    total_guests,
    avg_extras_per_guest: total_guests > 0 ? Math.round(total_extras_revenue / total_guests) : 0,
    fb_revenue,
    by_category: Array.from(byCategory.entries()).map(([category, total]) => ({
      category, total,
      pct: totalForPct > 0 ? Math.round((total / totalForPct) * 1000) / 10 : 0,
    })).sort((a, b) => b.total - a.total),
    daily: Array.from(daily.entries()).map(([date, total]) => ({ date, total })),
  }
}

// ─── Top items ──────────────────────────────────────────────────────────────

export interface TopItemRow {
  item_name:    string
  category:     string
  times_sold:   number
  total_qty:    number
  total_revenue: number
  avg_price:    number
  is_freeform:  boolean
}

export async function getTopChargeItems(period: PeriodRange, limit = 50): Promise<TopItemRow[]> {
  const fromIso = toIsoDate(period.from)
  const toIso   = toIsoDate(period.to)
  const { data } = await db()
    .from('checkout_charges')
    .select(`
      amount, quantity, charge_item_id, description,
      charge_item:charge_items (display_name, category:charge_categories (display_name)),
      checkout:checkouts!inner (status, finalized_at)
    `)
    .eq('checkout.status', 'finalized')
    .gte('checkout.finalized_at', fromIso).lte('checkout.finalized_at', `${toIso}T23:59:59`)

  const catalog = new Map<string, TopItemRow>()
  let freeformTotal = 0, freeformQty = 0, freeformCount = 0
  for (const c of (data ?? []) as any[]) {  // eslint-disable-line @typescript-eslint/no-explicit-any
    const amt = Number(c.amount ?? 0)
    const qty = Number(c.quantity ?? 0)
    if (c.charge_item_id && c.charge_item) {
      const k = c.charge_item_id
      const cur = catalog.get(k) ?? {
        item_name: c.charge_item.display_name,
        category:  c.charge_item.category?.display_name ?? 'Uncategorised',
        times_sold: 0, total_qty: 0, total_revenue: 0, avg_price: 0,
        is_freeform: false,
      }
      cur.times_sold += 1
      cur.total_qty += qty
      cur.total_revenue += amt
      catalog.set(k, cur)
    } else {
      freeformCount += 1; freeformQty += qty; freeformTotal += amt
    }
  }
  const rows = Array.from(catalog.values()).map((r) => ({ ...r, avg_price: r.times_sold > 0 ? Math.round(r.total_revenue / r.times_sold) : 0 }))
  rows.sort((a, b) => b.total_revenue - a.total_revenue)
  const top = rows.slice(0, limit)
  if (freeformCount > 0) {
    top.push({
      item_name: 'Free-form / one-off charges',
      category: '—',
      times_sold: freeformCount,
      total_qty: freeformQty,
      total_revenue: freeformTotal,
      avg_price: freeformCount > 0 ? Math.round(freeformTotal / freeformCount) : 0,
      is_freeform: true,
    })
  }
  return top
}

// ─── Extras by room type ────────────────────────────────────────────────────

export interface ExtrasByRoomTypeRow {
  room_type:           string
  finalized_checkouts: number
  extras_revenue:      number
  avg_per_checkout:    number
}

export async function getExtrasByRoomType(period: PeriodRange): Promise<ExtrasByRoomTypeRow[]> {
  const fromIso = toIsoDate(period.from)
  const toIso   = toIsoDate(period.to)
  const { data } = await db()
    .from('checkouts')
    .select('charges_total, booking:bookings!inner (booking_rooms (room_type, qty))')
    .eq('status', 'finalized')
    .gte('finalized_at', fromIso).lte('finalized_at', `${toIso}T23:59:59`)

  const byType = new Map<string, { revenue: number; checkouts: number }>()
  for (const co of (data ?? []) as any[]) {  // eslint-disable-line @typescript-eslint/no-explicit-any
    const amt = Number(co.charges_total ?? 0)
    const rooms = co.booking?.booking_rooms ?? []
    // attribute extras revenue to the room_type with the largest qty (primary room)
    if (rooms.length === 0) continue
    const primary = rooms.reduce((p: any, r: any) => Number(r.qty) > Number(p.qty) ? r : p, rooms[0])  // eslint-disable-line @typescript-eslint/no-explicit-any
    const cur = byType.get(primary.room_type) ?? { revenue: 0, checkouts: 0 }
    cur.revenue += amt; cur.checkouts += 1
    byType.set(primary.room_type, cur)
  }

  return Array.from(byType.entries())
    .map(([room_type, v]) => ({
      room_type,
      finalized_checkouts: v.checkouts,
      extras_revenue:      v.revenue,
      avg_per_checkout:    v.checkouts > 0 ? Math.round(v.revenue / v.checkouts) : 0,
    }))
    .sort((a, b) => b.extras_revenue - a.extras_revenue)
}
