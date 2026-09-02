/**
 * Turn booking rows (as the operations queries fetch them, with their
 * itinerary embedded) into the flat list of "meal units" the meals engine and
 * headcount queries iterate.
 *
 * An ordinary booking is one unit. A group booking is one unit PER SEGMENT,
 * each shaped like the daylong or one-night booking it stands in for, with
 * the meal flags of whichever package priced that segment. The group's own
 * header row is dropped — its headcount is the peak day, which is the wrong
 * number for every specific date.
 *
 * Server-only helper (the queries that use it are server-side), but it has no
 * Supabase dependency of its own.
 */

import { rowsToSegments, expandGroupForOps, type MealFlags } from './group-itinerary'

export interface MealUnit extends MealFlags {
  package_type:   'daylong' | 'night'
  visit_date:     string
  check_out_date: string | null
  adults:         number
  children_paid:  number
  children_free:  number
  drivers:        number
  /** True for a group's overnight segment whose people already slept here
   *  the night before — they are staying, not arriving, so no welcome drink. */
  is_continuation?: boolean
}

interface BookingRowLike {
  package_type:          string
  visit_date:            string
  check_out_date:        string | null
  adults?:               number | null
  children_paid?:        number | null
  children_free?:        number | null
  drivers?:              number | null
  package_snapshot?:     MealFlags | null
  day_package_snapshot?: MealFlags | null
  booking_days?:         Array<{
    day_date: string; stay_kind: string
    adults?: number | null; children_paid?: number | null; children_free?: number | null; drivers?: number | null
  }> | null
}

export function opsUnitsForMeals(rows: BookingRowLike[]): MealUnit[] {
  const out: MealUnit[] = []
  for (const b of rows) {
    if (b.package_type !== 'group') {
      const snap = b.package_snapshot ?? {}
      out.push({
        package_type:   b.package_type === 'night' ? 'night' : 'daylong',
        visit_date:     b.visit_date,
        check_out_date: b.check_out_date,
        adults:         Number(b.adults ?? 0),
        children_paid:  Number(b.children_paid ?? 0),
        children_free:  Number(b.children_free ?? 0),
        drivers:        Number(b.drivers ?? 0),
        includes_breakfast: snap.includes_breakfast,
        includes_lunch:     snap.includes_lunch,
        includes_dinner:    snap.includes_dinner,
        includes_snacks:    snap.includes_snacks,
      })
      continue
    }
    const segs = rowsToSegments((b.booking_days ?? []).map((d) => ({ ...d, adults: d.adults ?? 0, children_paid: d.children_paid ?? 0, children_free: d.children_free ?? 0, drivers: d.drivers ?? 0, rooms: [] })))
    const nightDates = new Set(segs.filter((s) => s.stay_kind === 'night').map((s) => s.day_date))
    const nightSnap = b.package_snapshot ?? {}
    const daySnap   = b.day_package_snapshot ?? nightSnap
    for (const v of expandGroupForOps(segs, nightSnap, daySnap)) {
      const prev = new Date(`${v.day_date}T12:00:00Z`)
      prev.setUTCDate(prev.getUTCDate() - 1)
      const prevIso = prev.toISOString().slice(0, 10)
      out.push({
        package_type:   v.package_type,
        visit_date:     v.visit_date,
        check_out_date: v.check_out_date,
        adults:         v.adults,
        children_paid:  v.children_paid,
        children_free:  v.children_free,
        drivers:        v.drivers,
        includes_breakfast: v.includes_breakfast,
        includes_lunch:     v.includes_lunch,
        includes_dinner:    v.includes_dinner,
        includes_snacks:    v.includes_snacks,
        is_continuation: v.stay_kind === 'night' && nightDates.has(prevIso),
      })
    }
  }
  return out
}
