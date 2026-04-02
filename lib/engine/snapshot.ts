/**
 * SNAPSHOT BUILDER
 *
 * Captures a complete frozen copy of package data at quote/booking creation time.
 * Future edits to the packages table MUST NOT affect existing quotes/bookings.
 */

import type { PackageRow, PackageRoomPriceRow, PackageSnapshot, RoomType } from '@/lib/supabase/types'

export function buildPackageSnapshot(
  pkg: PackageRow,
  roomPrices: PackageRoomPriceRow[],
): PackageSnapshot {
  // Build room_prices map: { cottage: 3000, deluxe: 2000, ... }
  const room_prices: Partial<Record<RoomType, number>> = {}
  for (const rp of roomPrices) {
    room_prices[rp.room_type] = rp.price
  }

  return {
    package_id:    pkg.id,
    name:          pkg.name,
    type:          pkg.type,
    weekday_adult: pkg.weekday_adult,
    friday_adult:  pkg.friday_adult,
    holiday_adult: pkg.holiday_adult,
    child_meal:    pkg.child_meal,
    driver_price:  pkg.driver_price,
    extra_person:  pkg.extra_person,
    extra_bed:     pkg.extra_bed,
    check_in:      pkg.check_in,
    check_out:     pkg.check_out,
    title:         pkg.title,
    intro:         pkg.intro,
    meals:         pkg.meals,
    activities:    pkg.activities,
    experience:    pkg.experience,
    why_choose_us: pkg.why_choose_us,
    cta:           pkg.cta,
    notes:         pkg.notes,
    room_prices,
    includes_breakfast: pkg.includes_breakfast,
    includes_lunch:     pkg.includes_lunch,
    includes_dinner:    pkg.includes_dinner,
    includes_snacks:    pkg.includes_snacks,
    snapshotted_at: new Date().toISOString(),
  }
}

/** Extract PackageRates from a snapshot (for re-calculation) */
export function snapshotToRates(snapshot: PackageSnapshot) {
  return {
    weekday_adult: snapshot.weekday_adult,
    friday_adult:  snapshot.friday_adult,
    holiday_adult: snapshot.holiday_adult,
    child_meal:    snapshot.child_meal,
    driver_price:  snapshot.driver_price,
    extra_person:  snapshot.extra_person,
    extra_bed:     snapshot.extra_bed,
  }
}
