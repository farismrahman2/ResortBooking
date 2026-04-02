/**
 * Meal allocation logic for the daily operations report.
 *
 * Meal counts are driven by per-package boolean flags (includes_breakfast, etc.)
 * stored in the package_snapshot.  Old snapshots without flags fall back to the
 * legacy hardcoded rules so existing bookings are unaffected.
 *
 * Per-day rules (flag must be true for the meal to be counted):
 *
 *   Daylong        visit_date only:   breakfast?, lunch?, snacks?   (no dinner)
 *   Night check-in visit_date:        lunch?, dinner?               (no breakfast / snacks)
 *   Night staying  (intermediate day): breakfast?, lunch?, dinner?  (no snacks)
 *   Night checkout check_out_date:    breakfast?                    (no other meals)
 */

export interface MealAllocation {
  breakfast: number
  lunch:     number
  dinner:    number
  snacks:    number   // evening snacks — typically daylong only
}

interface BookingForMeals {
  package_type:   'daylong' | 'night'
  visit_date:     string        // YYYY-MM-DD
  check_out_date: string | null
  adults:         number
  children_paid:  number
  children_free:  number
  /** Meal flags — read from package_snapshot; undefined = use legacy defaults */
  includes_breakfast?: boolean
  includes_lunch?:     boolean
  includes_dinner?:    boolean
  includes_snacks?:    boolean
}

/**
 * Returns how many portions of each meal this booking contributes on a given date.
 * All zero if the booking does not cover that date.
 */
export function getMealsForBookingOnDate(
  booking: BookingForMeals,
  date: string,
): MealAllocation {
  const none = { breakfast: 0, lunch: 0, dinner: 0, snacks: 0 }
  const guests = booking.adults + booking.children_paid + booking.children_free

  // Resolve flags — fall back to legacy behaviour for old snapshots missing flags
  const type = booking.package_type
  const hasBreakfast = booking.includes_breakfast ?? (type === 'night')
  const hasLunch     = booking.includes_lunch     ?? true
  const hasDinner    = booking.includes_dinner    ?? (type === 'night')
  const hasSnacks    = booking.includes_snacks    ?? (type === 'daylong')

  const n = (flag: boolean) => (flag ? guests : 0)

  if (type === 'daylong') {
    if (booking.visit_date !== date) return none
    return {
      breakfast: n(hasBreakfast),
      lunch:     n(hasLunch),
      dinner:    0,            // dinner never applies to daylong
      snacks:    n(hasSnacks),
    }
  }

  // Night stay
  const visitDate    = booking.visit_date
  const checkOutDate = booking.check_out_date ?? visitDate

  if (date === visitDate) {
    // Check-in day: no breakfast (arriving), lunch + dinner if included
    return { breakfast: 0, lunch: n(hasLunch), dinner: n(hasDinner), snacks: 0 }
  }

  if (date === checkOutDate) {
    // Check-out morning: breakfast only (departing after breakfast)
    return { breakfast: n(hasBreakfast), lunch: 0, dinner: 0, snacks: 0 }
  }

  if (date > visitDate && date < checkOutDate) {
    // Intermediate staying day: full day meals
    return {
      breakfast: n(hasBreakfast),
      lunch:     n(hasLunch),
      dinner:    n(hasDinner),
      snacks:    0,
    }
  }

  return none
}

/** Sum meal totals across a list of bookings for a given date */
export function calculateMealTotalsForDate(
  bookings: BookingForMeals[],
  date: string,
): MealAllocation {
  let breakfast = 0, lunch = 0, dinner = 0, snacks = 0
  for (const b of bookings) {
    const m = getMealsForBookingOnDate(b, date)
    breakfast += m.breakfast
    lunch     += m.lunch
    dinner    += m.dinner
    snacks    += m.snacks
  }
  return { breakfast, lunch, dinner, snacks }
}
