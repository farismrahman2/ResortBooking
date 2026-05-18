import { createClient } from '@/lib/supabase/server'
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
}

/**
 * Fetch all bookings whose date range covers `date` (for room occupancy)
 * or serves meals on `date`, along with their room assignments and meal allocation.
 */
export async function getDailyReport(date: string): Promise<DailyReportRow[]> {
  const supabase = createClient()

  // Fetch all non-cancelled bookings that start on or before `date`
  const { data: bookings, error } = await supabase
    .from('bookings')
    .select('*, booking_rooms(*)')
    .neq('status', 'cancelled')
    .lte('visit_date', date)
    .order('visit_date', { ascending: true })

  if (error) throw new Error(`getDailyReport: ${error.message}`)

  const rows: DailyReportRow[] = []

  for (const booking of bookings ?? []) {
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
