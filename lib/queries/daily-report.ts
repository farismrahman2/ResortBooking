import { createClient } from '@/lib/supabase/server'
import { selectWithOptionalEmbed } from '@/lib/supabase/optional-embed'
import { rowsToSegments, expandGroupForOps } from '@/lib/bookings/group-itinerary'
import type { StayKind } from '@/lib/supabase/types'
import { getMealsForBookingOnDate } from '@/lib/engine/meals'
import type { MealAllocation } from '@/lib/engine/meals'
import { ROOM_NUMBERS } from '@/lib/config/rooms'
import type { PackageType, RoomType } from '@/lib/supabase/types'

export interface DailyReportRoom {
  room_type:    RoomType
  qty:          number
  room_numbers: string[]   // manually assigned room numbers
}

export interface DailyReportRow {
  booking_number: string
  customer_name:  string
  customer_phone: string
  package_type:   PackageType
  visit_date:     string
  check_out_date: string | null
  nights:         number | null
  adults:         number
  children_paid:  number
  children_free:  number
  drivers:        number
  rooms:          DailyReportRoom[]
  meals:          MealAllocation
  is_checkin:     boolean   // check-in today
  is_checkout:    boolean   // check-out today
  /** Set when this row is one segment of a group itinerary. */
  group_segment?: StayKind
}

/**
 * Fetch all bookings whose date range covers `date` (for room occupancy)
 * or serves meals on `date`, along with their room assignments and meal allocation.
 */
export async function getDailyReport(date: string): Promise<DailyReportRow[]> {
  const supabase = createClient()

  // Bookings that actually cover `date` — daylong on the day, night stays
  // through checkout morning (inclusive). With only the upper bound this
  // fetched every booking ever; past the 1000-row response cap, in-house
  // bookings silently fell OFF the daily report.
  const { data: bookings, error } = await selectWithOptionalEmbed<any[]>(  // eslint-disable-line @typescript-eslint/no-explicit-any
    (select) => (supabase as any)   // eslint-disable-line @typescript-eslint/no-explicit-any
      .from('bookings')
      .select(select)
      .neq('status', 'cancelled')
      .lte('visit_date', date)
      .or(`check_out_date.gte.${date},and(check_out_date.is.null,visit_date.eq.${date})`)
      .order('visit_date', { ascending: true }),
    '*, booking_rooms(*), booking_days(*, booking_day_rooms(*))',
    '*, booking_rooms(*)',
  )

  if (error) throw new Error(`getDailyReport: ${(error as { message?: string }).message}`)

  const rows: DailyReportRow[] = []

  for (const booking of bookings ?? []) {
    // A group is its itinerary: one row per segment that touches this date,
    // shaped exactly like the daylong / night booking it stands in for, so
    // meals, room occupancy and the free-rooms maths need no special case.
    if (booking.package_type === 'group') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const segs = rowsToSegments(((booking as any).booking_days ?? []).map((d: any) => ({ ...d, rooms: d.booking_day_rooms ?? [] })))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const nightSnap = (booking.package_snapshot ?? {}) as any
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const daySnap   = ((booking as any).day_package_snapshot ?? nightSnap) as any
      for (const v of expandGroupForOps(segs, nightSnap, daySnap)) {
        const covers = v.package_type === 'daylong'
          ? v.visit_date === date
          : v.visit_date <= date && date <= (v.check_out_date as string)
        if (!covers) continue
        rows.push({
          booking_number: booking.booking_number,
          customer_name:  booking.customer_name,
          customer_phone: booking.customer_phone,
          package_type:   v.package_type,
          visit_date:     v.visit_date,
          check_out_date: v.check_out_date,
          nights:         v.package_type === 'night' ? 1 : null,
          adults:         v.adults,
          children_paid:  v.children_paid,
          children_free:  v.children_free,
          drivers:        v.drivers,
          rooms:          v.rooms.map((r) => ({ room_type: r.room_type as RoomType, qty: r.qty, room_numbers: r.room_numbers ?? [] })),
          meals:          getMealsForBookingOnDate({
            package_type: v.package_type, visit_date: v.visit_date, check_out_date: v.check_out_date,
            adults: v.adults, children_paid: v.children_paid, children_free: v.children_free,
            includes_breakfast: v.includes_breakfast, includes_lunch: v.includes_lunch,
            includes_dinner: v.includes_dinner, includes_snacks: v.includes_snacks,
          }, date),
          is_checkin:  v.visit_date === date,
          is_checkout: v.check_out_date === date,
          group_segment: v.stay_kind,
        })
      }
      continue
    }

    // Determine if the booking covers this date in any meaningful way:
    // - daylong:   visit_date === date
    // - night:     date in [visit_date, check_out_date]  (inclusive — breakfast on check-out morning)
    let covers = false
    if (booking.package_type === 'daylong') {
      covers = booking.visit_date === date
    } else {
      const co = booking.check_out_date
      if (co) covers = booking.visit_date <= date && date <= co
    }
    if (!covers) continue

    const snap = (booking.package_snapshot ?? {}) as any
    const meals = getMealsForBookingOnDate(
      {
        package_type:       booking.package_type,
        visit_date:         booking.visit_date,
        check_out_date:     booking.check_out_date,
        adults:             booking.adults,
        children_paid:      booking.children_paid,
        children_free:      booking.children_free,
        includes_breakfast: snap.includes_breakfast,
        includes_lunch:     snap.includes_lunch,
        includes_dinner:    snap.includes_dinner,
        includes_snacks:    snap.includes_snacks,
      },
      date,
    )

    const rooms: DailyReportRoom[] = ((booking as any).booking_rooms ?? []).map((r: any) => ({
      room_type:    r.room_type as RoomType,
      qty:          r.qty,
      room_numbers: r.room_numbers ?? [],
    }))

    rows.push({
      booking_number: booking.booking_number,
      customer_name:  booking.customer_name,
      customer_phone: booking.customer_phone,
      package_type:   booking.package_type,
      visit_date:     booking.visit_date,
      check_out_date: booking.check_out_date,
      nights:         booking.nights,
      adults:         booking.adults,
      children_paid:  booking.children_paid,
      children_free:  booking.children_free,
      drivers:        booking.drivers ?? 0,
      rooms,
      meals,
      is_checkin:  booking.visit_date === date,
      is_checkout: booking.check_out_date === date,
    })
  }

  return rows
}

export interface FreeRooms {
  /** Rooms with no booking activity today */
  free_all_day: string[]
  /** Rooms whose night-stay checkout is today AND no booking reoccupies the room today */
  free_after_12pm: string[]
  /** Rooms occupied by a daylong booking ending today (free once the daylong session ends) */
  free_after_6pm: string[]
}

/**
 * Classify every room number in the inventory as free-all-day / free-after-12 /
 * free-after-6 for the given date. Pure night-stay checkouts whose rooms aren't
 * reoccupied today land in `free_after_12pm`; daylong rooms land in
 * `free_after_6pm`; the rest is free all day.
 *
 * Note: `rows` is the unfiltered daily report — i.e. it includes night-stay
 * checkouts. The presentation layer chooses to hide those checkouts from the
 * main listing (they leave by noon) but they still inform "free after 12".
 */
export function computeFreeRooms(rows: DailyReportRow[]): FreeRooms {
  const allRoomNumbers: string[] = Object.values(ROOM_NUMBERS).flatMap((arr) => arr ?? [])

  const occupiedAllDay     = new Set<string>()   // staying / arriving / daylong — visibly in-house today
  const nightCheckoutRooms = new Set<string>()   // night stays whose check_out_date is today
  const daylongRooms       = new Set<string>()   // daylong bookings today

  for (const row of rows) {
    const isNightCheckout = row.is_checkout && row.package_type === 'night'
    for (const r of row.rooms) {
      for (const num of r.room_numbers) {
        if (isNightCheckout) {
          nightCheckoutRooms.add(num)
        } else {
          occupiedAllDay.add(num)
          if (row.package_type === 'daylong') daylongRooms.add(num)
        }
      }
    }
  }

  const free_after_12pm = [...nightCheckoutRooms].filter((n) => !occupiedAllDay.has(n))
  const free_after_6pm  = [...daylongRooms]
  const free_all_day    = allRoomNumbers.filter(
    (n) => !occupiedAllDay.has(n) && !nightCheckoutRooms.has(n),
  )

  // Sort numerically where possible
  const cmp = (a: string, b: string) => {
    const an = parseInt(a, 10), bn = parseInt(b, 10)
    if (Number.isFinite(an) && Number.isFinite(bn) && an !== bn) return an - bn
    return a.localeCompare(b)
  }
  return {
    free_all_day:    free_all_day.sort(cmp),
    free_after_12pm: free_after_12pm.sort(cmp),
    free_after_6pm:  free_after_6pm.sort(cmp),
  }
}
