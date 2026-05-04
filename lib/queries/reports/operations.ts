import { createServiceClient } from '@/lib/supabase/server'
import { unstable_cache } from 'next/cache'
import { toIsoDate } from '@/lib/reports/periods'
import type { PeriodRange } from '@/lib/reports/types'
import { addDays, format } from 'date-fns'

const db = () => createServiceClient() as any  // eslint-disable-line @typescript-eslint/no-explicit-any

export interface OccupancyDay { date: string; rooms_occupied: number; total_rooms: number; occupancy_pct: number | null }

export const getOccupancyByDay = (period: PeriodRange) => unstable_cache(
  async (): Promise<OccupancyDay[]> => {
    const { data } = await db().rpc('reports_daily_occupancy', {
      p_from: toIsoDate(period.from), p_to: toIsoDate(period.to),
    })
    return ((data ?? []) as OccupancyDay[]).map((r) => ({
      date: r.date,
      rooms_occupied: Number(r.rooms_occupied ?? 0),
      total_rooms: Number(r.total_rooms ?? 0),
      occupancy_pct: r.occupancy_pct === null ? null : Number(r.occupancy_pct),
    }))
  },
  ['reports-occupancy', toIsoDate(period.from), toIsoDate(period.to)],
  { revalidate: 60, tags: ['reports'] },
)()

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
