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
 *
 * Detection strategy for the daylong adult line:
 * 1. Prefer `line_item.kind === 'adult'` (set by the calculator since the
 *    LineItemKind change). Stable across label / locale renames.
 * 2. Fall back to a regex on `label` for legacy bookings whose frozen
 *    line_items predate the `kind` field.
 */
export function getExtraGuestUnitPrice(booking: BookingRow): number {
  if (booking.package_type === 'night') {
    return Number(booking.package_snapshot?.extra_person ?? 0)
  }
  // Daylong — find the line item that represents adult headcount.
  const lines = booking.line_items ?? []
  const adultLine =
    lines.find((li) => li.kind === 'adult')
    ?? lines.find(
      (li) => Number(li.qty) === Number(booking.adults) && /adult/i.test(li.label),
    )
  if (adultLine) return Number(adultLine.unit_price ?? 0)
  // Fallback: weekday adult rate from the snapshot
  return Number(booking.package_snapshot?.weekday_adult ?? 0)
}
