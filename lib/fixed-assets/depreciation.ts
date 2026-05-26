import type { DepreciationResult } from '@/lib/supabase/types-fixed-assets'

export interface DepreciationInputs {
  acquisitionCost:       number
  salvageValue:          number
  usefulLifeYears:       number
  depreciationStartDate: Date
  asOfDate?:             Date
  disposalDate?:         Date | null
}

/** Whole months between two dates (calendar-month based, never negative). */
function monthsBetween(from: Date, to: Date): number {
  const months = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth())
  // Subtract a partial month if the day-of-month hasn't been reached yet.
  const adj = to.getDate() < from.getDate() ? -1 : 0
  return Math.max(0, months + adj)
}

/**
 * Straight-line depreciation. Net book value never drops below salvage value.
 * Depreciation stops at disposal date (if disposed) or as-of date (default today).
 */
export function computeDepreciation(inputs: DepreciationInputs): DepreciationResult {
  const { acquisitionCost, salvageValue, usefulLifeYears, depreciationStartDate } = inputs
  const asOf = inputs.disposalDate ?? inputs.asOfDate ?? new Date()

  const totalMonths = usefulLifeYears * 12
  const depreciableBase = Math.max(0, acquisitionCost - salvageValue)
  const monthlyDepreciation = totalMonths > 0 ? Math.round((depreciableBase / totalMonths) * 100) / 100 : 0

  const elapsed = monthsBetween(depreciationStartDate, asOf)
  const monthsElapsed = Math.min(elapsed, totalMonths)

  const rawTotal = monthlyDepreciation * monthsElapsed
  const totalDepreciation = Math.round(Math.min(rawTotal, depreciableBase) * 100) / 100
  const netBookValue = Math.round(Math.max(acquisitionCost - totalDepreciation, salvageValue) * 100) / 100
  const remainingUsefulMonths = Math.max(totalMonths - monthsElapsed, 0)

  return {
    monthlyDepreciation,
    monthsElapsed,
    totalDepreciation,
    netBookValue,
    remainingUsefulMonths,
    isFullyDepreciated: monthsElapsed >= totalMonths,
  }
}
