import { createClient } from '@/lib/supabase/server'
import { getMealsForBookingOnDate } from '@/lib/engine/meals'
import type { MealAllocation } from '@/lib/engine/meals'
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
      rooms,
      meals,
      is_checkin:  booking.visit_date === date,
      is_checkout: booking.check_out_date === date,
    })
  }

  return rows
}
