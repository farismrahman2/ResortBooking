import { createServiceClient } from '@/lib/supabase/server'
import { unstable_cache } from 'next/cache'
import { toIsoDate } from '@/lib/reports/periods'
import type { PeriodRange } from '@/lib/reports/types'
import { addDays, format } from 'date-fns'

const db = () => createServiceClient() as any  // eslint-disable-line @typescript-eslint/no-explicit-any

export interface OccupancyDay { date: string; rooms_occupied: number; total_rooms: number; occupancy_pct: number | null }

export const getOccupancyByDay = (period: PeriodRange) => unstable_cache(
  async (): Promise<OccupancyDay[]> => {
    const fromIso = toIsoDate(period.from)
    const toIso   = toIsoDate(period.to)
    const { data, error } = await db().rpc('reports_daily_occupancy', { p_from: fromIso, p_to: toIso })
    if (!error && data && data.length > 0) {
      return (data as OccupancyDay[]).map((r) => ({
        date: r.date,
        rooms_occupied: Number(r.rooms_occupied ?? 0),
        total_rooms: Number(r.total_rooms ?? 0),
        occupancy_pct: r.occupancy_pct === null ? null : Number(r.occupancy_pct),
      }))
    }
    // RPC missing / errored / empty — log it AND compute in JS so the report
    // doesn't go silently dark. The reports_daily_occupancy migration in
    // reports-module/000 needs to be applied for the fast path to work, but
    // the fallback keeps the page useful in the meantime.
    if (error) console.error('[reports.occupancy] RPC failed, falling back:', error.message)
    return await fallbackOccupancy(fromIso, toIso)
  },
  ['reports-occupancy', toIsoDate(period.from), toIsoDate(period.to)],
  { revalidate: 60, tags: ['reports'] },
)()

/** JS-side recompute of reports_daily_occupancy when the RPC is unavailable.
 *  Mirrors the SQL exactly: one row per day in [from, to], rooms_occupied =
 *  Σ booking_rooms.qty for bookings active on that day (excludes cancelled
 *  and no-show), total_rooms = settings.total_rooms or Σ room_inventory.
 *  Slower than the RPC but correct on any schema. */
async function fallbackOccupancy(fromIso: string, toIso: string): Promise<OccupancyDay[]> {
  const sb = db()
  // total_rooms — try the setting first, fall back to room_inventory total
  const [{ data: setting }, { data: inventory }] = await Promise.all([
    sb.from('settings').select('value').eq('key', 'total_rooms').maybeSingle(),
    sb.from('room_inventory').select('total_units'),
  ])
  const settingN = Number((setting?.value ?? '').toString().trim() || NaN)
  const invN     = ((inventory ?? []) as { total_units: number }[]).reduce((s, r) => s + Number(r.total_units ?? 0), 0)
  const totalRooms = Number.isFinite(settingN) && settingN > 0 ? settingN : invN

  // Bookings that overlap the window. Excludes cancelled + no_show.
  const { data: rows } = await sb.from('bookings')
    .select('id, package_type, visit_date, check_out_date, status, booking_rooms(qty)')
    .neq('status', 'cancelled')
    .neq('status', 'no_show')
    .lte('visit_date', toIso)
    .or(`check_out_date.is.null,check_out_date.gte.${fromIso}`)

  // Map: YYYY-MM-DD → rooms_occupied
  const occupied = new Map<string, number>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const b of (rows ?? []) as any[]) {
    const qty = (b.booking_rooms ?? []).reduce((s: number, br: { qty: number }) => s + Number(br.qty ?? 0), 0)
    if (qty === 0) continue
    const start = b.visit_date as string
    if (b.package_type === 'daylong' || !b.check_out_date) {
      occupied.set(start, (occupied.get(start) ?? 0) + qty)
    } else {
      // [visit_date, check_out_date)
      const end = b.check_out_date as string
      const cursor = new Date(start + 'T00:00:00Z')
      const endD   = new Date(end   + 'T00:00:00Z')
      while (cursor < endD) {
        const k = cursor.toISOString().slice(0, 10)
        occupied.set(k, (occupied.get(k) ?? 0) + qty)
        cursor.setUTCDate(cursor.getUTCDate() + 1)
      }
    }
  }

  // Generate one OccupancyDay per day in window
  const out: OccupancyDay[] = []
  const cursor = new Date(fromIso + 'T00:00:00Z')
  const endD   = new Date(toIso   + 'T00:00:00Z')
  while (cursor <= endD) {
    const k = cursor.toISOString().slice(0, 10)
    const ro = occupied.get(k) ?? 0
    out.push({
      date: k,
      rooms_occupied: ro,
      total_rooms: totalRooms,
      occupancy_pct: totalRooms === 0 ? 0 : Math.round((ro / totalRooms) * 10000) / 100,
    })
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return out
}

export interface PickupWeekRow { week_start: string; week_label: string; rooms_booked: number; rooms_available: number; pct_booked: number | null }

/** Pickup pace: forward-looking 8-week occupancy */
export const getPickupPace = unstable_cache(
  async (): Promise<PickupWeekRow[]> => {
    const today = new Date()
    const weeks: PickupWeekRow[] = []
    for (let i = 0; i < 8; i++) {
      const start = addDays(today, i * 7)
      const end   = addDays(start, 6)
      const { data } = await db().rpc('reports_daily_occupancy', {
        p_from: toIsoDate(start), p_to: toIsoDate(end),
      })
      const rows = (data ?? []) as Array<{ rooms_occupied: number; total_rooms: number }>
      const booked    = rows.reduce((s, r) => s + Number(r.rooms_occupied ?? 0), 0)
      const available = rows.reduce((s, r) => s + Number(r.total_rooms ?? 0), 0)
      weeks.push({
        week_start: toIsoDate(start),
        week_label: `${format(start, 'd MMM')}–${format(end, 'd MMM')}`,
        rooms_booked: booked,
        rooms_available: available,
        pct_booked: available > 0 ? Math.round((booked / available) * 1000) / 10 : null,
      })
    }
    return weeks
  },
  ['reports-pickup-pace'],
  { revalidate: 60, tags: ['reports'] },
)
