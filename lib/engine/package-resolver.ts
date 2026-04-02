/**
 * PACKAGE RESOLVER
 *
 * Determines which package applies to a given date and type.
 * Override packages (e.g. Boishakh) take priority over regular packages.
 */

import type { PackageRow, PackageType } from '@/lib/supabase/types'

function toISODate(date: Date): string {
  return date.toISOString().split('T')[0]
}

/**
 * Check if a package is valid for a specific date.
 */
function isPackageValidForDate(pkg: PackageRow, date: Date): boolean {
  const dateStr = toISODate(date)

  if (pkg.all_year) return true

  // Specific dates override the range check
  if (pkg.specific_dates.length > 0) {
    return pkg.specific_dates.includes(dateStr)
  }

  // Date range
  if (pkg.valid_from && pkg.valid_to) {
    return dateStr >= pkg.valid_from && dateStr <= pkg.valid_to
  }

  return false
}

/**
 * Resolve which package applies to a given date and booking type.
 *
 * Algorithm:
 * 1. Filter: active packages whose type matches
 * 2. Separate overrides from regular packages
 * 3. Filter each group by date validity
 * 4. Return lowest display_order override if any exist;
 *    otherwise return lowest display_order regular package.
 */
export function resolvePackage(
  date: Date,
  type: PackageType,
  packages: PackageRow[],
): PackageRow | null {
  const eligible = packages.filter((p) => p.is_active && p.type === type)

  const overrides = eligible
    .filter((p) => p.is_override && isPackageValidForDate(p, date))
    .sort((a, b) => a.display_order - b.display_order)

  if (overrides.length > 0) return overrides[0]

  const regulars = eligible
    .filter((p) => !p.is_override && isPackageValidForDate(p, date))
    .sort((a, b) => a.display_order - b.display_order)

  return regulars[0] ?? null
}

/**
 * Get all packages valid for a date (for showing options to the user).
 */
export function getValidPackagesForDate(
  date: Date,
  type: PackageType,
  packages: PackageRow[],
): PackageRow[] {
  return packages
    .filter((p) => p.is_active && p.type === type && isPackageValidForDate(p, date))
    .sort((a, b) => {
      // Overrides first, then by display order
      if (a.is_override !== b.is_override) return a.is_override ? -1 : 1
      return a.display_order - b.display_order
    })
}

/** Check if a given date has an override package active */
export function hasOverridePackage(
  date: Date,
  type: PackageType,
  packages: PackageRow[],
): boolean {
  return packages.some(
    (p) => p.is_active && p.type === type && p.is_override && isPackageValidForDate(p, date),
  )
}
