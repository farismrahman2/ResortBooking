import type { BookingRow } from '@/lib/supabase/types'

/**
 * Per-extra-guest price to charge at checkout, derived from the booking's
 * frozen package_snapshot + line_items.
 *
 * - Night package: per-night charge from snapshot.extra_person
 *   (the modal multiplies by remaining nights)
 * - Daylong: per-guest charge = the adult rate that was applied at booking
 *   time. We pull it from line_items because they reflect the package's
 *   actually-resolved rate (Friday vs Holiday vs Weekday) at booking time —
 *   more accurate than re-resolving from visit_date today.
 */
export function getExtraGuestUnitPrice(booking: BookingRow): number {
  if (booking.package_type === 'night') {
    return Number(booking.package_snapshot?.extra_person ?? 0)
  }
  // Daylong — find the line item that represents adult headcount.
  // Heuristic: qty matches booking.adults AND the label mentions "adult".
  const adultLine = (booking.line_items ?? []).find(
    (li) => Number(li.qty) === Number(booking.adults) && /adult/i.test(li.label),
  )
  if (adultLine) return Number(adultLine.unit_price ?? 0)
  // Fallback: weekday adult rate from the snapshot
  return Number(booking.package_snapshot?.weekday_adult ?? 0)
}
