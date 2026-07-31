import { createClient } from '@/lib/supabase/server'
import { getTodayInDhaka } from '@/lib/coffee-shop/timezone'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createClient() as any

export interface TodayRow {
  id:             string
  booking_number: string
  customer_name:  string
  customer_phone: string
  package_type:   string
  status:         string
  room_numbers:   string[]
  guests:         number
  remaining:      number
}

export interface TodaySnapshot {
  date:            string
  arrivals:        TodayRow[]
  departures:      TodayRow[]
  inHouse:         number
  roomsOccupied:   number
  totalRooms:      number
  occupancyPct:    number
  /** Last 7 days of booking counts (oldest → today) for the sparkline. */
  bookingTrend:    { date: string; count: number; revenue: number }[]
}

function toRow(b: any): TodayRow {   // eslint-disable-line @typescript-eslint/no-explicit-any
  const rooms = (b.booking_rooms ?? []).flatMap((r: any) => r.room_numbers ?? [])
  return {
    id:             b.id,
    booking_number: b.booking_number,
    customer_name:  b.customer_name,
    customer_phone: b.customer_phone,
    package_type:   b.package_type,
    status:         b.status,
    room_numbers:   rooms,
    guests:         (b.adults ?? 0) + (b.children_paid ?? 0) + (b.children_free ?? 0),
    remaining:      Number(b.remaining ?? 0),
  }
}

/**
 * Everything the dashboard needs to answer "what's happening today".
 * Cancelled and no-show bookings are excluded throughout — a guest who
 * cancelled is not arriving.
 */
export async function getTodaySnapshot(): Promise<TodaySnapshot> {
  const today = getTodayInDhaka()
  const SELECT = `
    id, booking_number, customer_name, customer_phone, package_type, status,
    adults, children_paid, children_free, remaining, visit_date, check_out_date,
    booking_rooms(room_numbers, qty)
  `

  const [arrivalsRes, departuresRes, inHouseRes, invRes, settingRes, trendRes] = await Promise.all([
    // Arriving today
    db().from('bookings').select(SELECT)
      .eq('visit_date', today)
      .not('status', 'in', '("cancelled","no_show")'),
    // Night stays checking out today
    db().from('bookings').select(SELECT)
      .eq('check_out_date', today)
      .not('status', 'in', '("cancelled","no_show")'),
    // Staying over tonight: started on/before today, leaving after today
    db().from('bookings').select('id, adults, children_paid, children_free, booking_rooms(qty)')
      .lte('visit_date', today).gt('check_out_date', today)
      .not('status', 'in', '("cancelled","no_show")'),
    db().from('room_inventory').select('total_units'),
    db().from('settings').select('value').eq('key', 'total_rooms').maybeSingle(),
    // 7-day created-at trend
    db().from('bookings').select('created_at, total, status')
      .gte('created_at', new Date(Date.now() - 7 * 86400_000).toISOString())
      .not('status', 'in', '("cancelled")'),
  ])

  const arrivals   = ((arrivalsRes.data   ?? []) as any[]).map(toRow)
  const departures = ((departuresRes.data ?? []) as any[]).map(toRow)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const inHouseRows = (inHouseRes.data ?? []) as any[]
  const inHouse = inHouseRows.reduce(
    (s, b) => s + (b.adults ?? 0) + (b.children_paid ?? 0) + (b.children_free ?? 0), 0,
  )

  // Rooms physically occupied tonight = staying over + arriving night stays
  const stayoverRooms = inHouseRows.reduce(
    (s, b) => s + (b.booking_rooms ?? []).reduce((x: number, r: any) => x + (r.qty ?? 0), 0), 0,
  )
  const arrivingNightRooms = arrivals
    .filter((a) => a.package_type === 'night')
    .reduce((s, a) => s + Math.max(a.room_numbers.length, 1), 0)
  const roomsOccupied = stayoverRooms + arrivingNightRooms

  const settingN = Number((settingRes.data?.value ?? '').toString().trim() || NaN)
  const invN = ((invRes.data ?? []) as { total_units: number }[])
    .reduce((s, r) => s + Number(r.total_units ?? 0), 0)
  const totalRooms = Number.isFinite(settingN) && settingN > 0 ? settingN : invN

  // 7-day trend, bucketed by Dhaka calendar date
  const buckets = new Map<string, { count: number; revenue: number }>()
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400_000)
    buckets.set(getTodayInDhaka(d), { count: 0, revenue: 0 })
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const b of (trendRes.data ?? []) as any[]) {
    const key = getTodayInDhaka(new Date(b.created_at))
    const cur = buckets.get(key)
    if (cur) { cur.count += 1; cur.revenue += Number(b.total ?? 0) }
  }

  return {
    date: today,
    arrivals,
    departures,
    inHouse,
    roomsOccupied,
    totalRooms,
    occupancyPct: totalRooms > 0 ? Math.round((roomsOccupied / totalRooms) * 100) : 0,
    bookingTrend: [...buckets.entries()].map(([date, v]) => ({ date, ...v })),
  }
}
