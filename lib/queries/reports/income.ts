import { createServiceClient } from '@/lib/supabase/server'
import { unstable_cache } from 'next/cache'
import { toIsoDate } from '@/lib/reports/periods'
import type { PeriodRange } from '@/lib/reports/types'

interface DbRows<T> { rows: T[] }
const db = () => createServiceClient() as any  // eslint-disable-line @typescript-eslint/no-explicit-any

// ─── Income overview (daily trend, by-package, by-day-of-week) ───────────────

export interface DailyIncomeRow { date: string; room_revenue: number; extras_revenue: number; coffee_shop_revenue: number; total_revenue: number; bookings: number }
export interface PackageRevenueRow { package_name: string; bookings: number; total_revenue: number; avg_per_booking: number; pct_of_total: number }
export interface DowRow { dow: number; label: string; total_revenue: number; bookings: number; avg_revenue_per_day: number; days_in_period: number; avg_occupancy_pct: number }

const DOW_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

async function fetchDailyIncome(period: PeriodRange): Promise<DailyIncomeRow[]> {
  const fromIso = toIsoDate(period.from)
  const toIso   = toIsoDate(period.to)
  const [{ data: bookings }, { data: checkouts }, coffeeRes] = await Promise.all([
    db().from('bookings')
      .select('visit_date, total')
      .gte('visit_date', fromIso).lte('visit_date', toIso).neq('status', 'cancelled'),
    db().from('checkouts')
      .select('finalized_at, charges_total')
      .eq('status', 'finalized')
      .gte('finalized_at', fromIso).lte('finalized_at', `${toIso}T23:59:59`),
    db().from('coffee_shop_sales')
      .select('sale_date, net_amount')
      .eq('status', 'completed')
      .gte('sale_date', fromIso).lte('sale_date', toIso),
  ])
  const byDay = new Map<string, DailyIncomeRow>()
  // initialize zero-fill
  let d = new Date(period.from)
  while (d <= period.to) {
    const iso = toIsoDate(d)
    byDay.set(iso, { date: iso, room_revenue: 0, extras_revenue: 0, coffee_shop_revenue: 0, total_revenue: 0, bookings: 0 })
    d = new Date(d.getTime() + 86400_000)
  }
  for (const b of (bookings ?? []) as Array<{ visit_date: string; total: number }>) {
    const r = byDay.get(b.visit_date)
    if (!r) continue
    r.room_revenue += Number(b.total ?? 0)
    r.bookings += 1
  }
  for (const c of (checkouts ?? []) as Array<{ finalized_at: string; charges_total: number }>) {
    const iso = c.finalized_at.slice(0, 10)
    const r = byDay.get(iso)
    if (!r) continue
    r.extras_revenue += Number(c.charges_total ?? 0)
  }
  for (const cs of (coffeeRes.data ?? []) as Array<{ sale_date: string; net_amount: number }>) {
    const r = byDay.get(cs.sale_date)
    if (!r) continue
    r.coffee_shop_revenue += Number(cs.net_amount ?? 0)
  }
  for (const r of byDay.values()) r.total_revenue = r.room_revenue + r.extras_revenue + r.coffee_shop_revenue
  return Array.from(byDay.values())
}

export const getDailyIncome = (period: PeriodRange) => unstable_cache(
  () => fetchDailyIncome(period),
  ['reports-daily-income', toIsoDate(period.from), toIsoDate(period.to)],
  { revalidate: 60, tags: ['reports'] },
)()

async function fetchPackageRevenue(period: PeriodRange): Promise<PackageRevenueRow[]> {
  const fromIso = toIsoDate(period.from)
  const toIso   = toIsoDate(period.to)
  const { data } = await db().from('bookings')
    .select('total, package_snapshot')
    .gte('visit_date', fromIso).lte('visit_date', toIso).neq('status', 'cancelled')
  const byPkg = new Map<string, { revenue: number; bookings: number }>()
  for (const b of (data ?? []) as Array<{ total: number; package_snapshot: { name?: string } | null }>) {
    const name = b.package_snapshot?.name ?? '(Unnamed)'
    const cur = byPkg.get(name) ?? { revenue: 0, bookings: 0 }
    cur.revenue += Number(b.total ?? 0)
    cur.bookings += 1
    byPkg.set(name, cur)
  }
  const total = Array.from(byPkg.values()).reduce((s, r) => s + r.revenue, 0)
  const rows: PackageRevenueRow[] = Array.from(byPkg.entries()).map(([name, v]) => ({
    package_name:    name,
    bookings:        v.bookings,
    total_revenue:   v.revenue,
    avg_per_booking: v.bookings > 0 ? Math.round(v.revenue / v.bookings) : 0,
    pct_of_total:    total > 0 ? Math.round((v.revenue / total) * 1000) / 10 : 0,
  }))
  rows.sort((a, b) => b.total_revenue - a.total_revenue)
  return rows
}

export const getPackageRevenue = (period: PeriodRange) => unstable_cache(
  () => fetchPackageRevenue(period),
  ['reports-package-revenue', toIsoDate(period.from), toIsoDate(period.to)],
  { revalidate: 60, tags: ['reports'] },
)()

async function fetchDayOfWeek(period: PeriodRange): Promise<DowRow[]> {
  const fromIso = toIsoDate(period.from)
  const toIso   = toIsoDate(period.to)
  const [{ data: bookings }, { data: occ }] = await Promise.all([
    db().from('bookings')
      .select('visit_date, total')
      .gte('visit_date', fromIso).lte('visit_date', toIso).neq('status', 'cancelled'),
    db().rpc('reports_daily_occupancy', { p_from: fromIso, p_to: toIso }),
  ])
  const stats: DowRow[] = DOW_LABELS.map((label, i) => ({
    dow: i, label, total_revenue: 0, bookings: 0, avg_revenue_per_day: 0, days_in_period: 0, avg_occupancy_pct: 0,
  }))
  // count days per dow
  let d = new Date(period.from)
  while (d <= period.to) {
    stats[d.getDay()].days_in_period += 1
    d = new Date(d.getTime() + 86400_000)
  }
  for (const b of (bookings ?? []) as Array<{ visit_date: string; total: number }>) {
    const day = new Date(b.visit_date + 'T00:00:00').getDay()
    stats[day].total_revenue += Number(b.total ?? 0)
    stats[day].bookings += 1
  }
  for (const o of (occ ?? []) as Array<{ date: string; occupancy_pct: number }>) {
    const day = new Date(o.date + 'T00:00:00').getDay()
    stats[day].avg_occupancy_pct += Number(o.occupancy_pct ?? 0)
  }
  for (const s of stats) {
    s.avg_revenue_per_day = s.days_in_period > 0 ? Math.round(s.total_revenue / s.days_in_period) : 0
    s.avg_occupancy_pct   = s.days_in_period > 0 ? Math.round((s.avg_occupancy_pct / s.days_in_period) * 10) / 10 : 0
  }
  // Reorder Mon-first for display
  return [stats[1], stats[2], stats[3], stats[4], stats[5], stats[6], stats[0]]
}

export const getDayOfWeekStats = (period: PeriodRange) => unstable_cache(
  () => fetchDayOfWeek(period),
  ['reports-dow', toIsoDate(period.from), toIsoDate(period.to)],
  { revalidate: 60, tags: ['reports'] },
)()

// ─── Industry KPIs (ADR, RevPAR) ─────────────────────────────────────────────

export interface IndustryKpis {
  adr: number | null
  revpar: number | null
  occupancy_pct: number | null
  total_room_nights_sold: number
  total_available_room_nights: number
  total_room_revenue: number
  total_rooms: number | null
  days_in_period: number
}

async function fetchIndustryKpis(period: PeriodRange): Promise<IndustryKpis> {
  const fromIso = toIsoDate(period.from)
  const toIso   = toIsoDate(period.to)
  const [{ data: occ }, { data: bookings }] = await Promise.all([
    db().rpc('reports_daily_occupancy', { p_from: fromIso, p_to: toIso }),
    db().from('bookings')
      .select('total, package_type, visit_date, check_out_date, nights')
      .gte('visit_date', fromIso).lte('visit_date', toIso).neq('status', 'cancelled'),
  ])
  const occRows = (occ ?? []) as Array<{ rooms_occupied: number; total_rooms: number }>
  const days = occRows.length
  const totalRooms = days > 0 ? occRows[0].total_rooms : null
  const roomNightsSold      = occRows.reduce((s, r) => s + Number(r.rooms_occupied ?? 0), 0)
  const availableRoomNights = totalRooms ? totalRooms * days : 0
  const roomRevenue         = (bookings ?? []).reduce((s: number, b: any) => s + Number(b.total ?? 0), 0)  // eslint-disable-line @typescript-eslint/no-explicit-any
  const adr     = roomNightsSold > 0      ? Math.round(roomRevenue / roomNightsSold) : null
  const revpar  = availableRoomNights > 0 ? Math.round(roomRevenue / availableRoomNights) : null
  const occPct  = availableRoomNights > 0 ? Math.round((roomNightsSold / availableRoomNights) * 1000) / 10 : null
  return {
    adr, revpar, occupancy_pct: occPct,
    total_room_nights_sold:       roomNightsSold,
    total_available_room_nights:  availableRoomNights,
    total_room_revenue:           roomRevenue,
    total_rooms:                  totalRooms,
    days_in_period:               days,
  }
}

export const getIndustryKpis = (period: PeriodRange) => unstable_cache(
  () => fetchIndustryKpis(period),
  ['reports-industry-kpis', toIsoDate(period.from), toIsoDate(period.to)],
  { revalidate: 60, tags: ['reports'] },
)()
