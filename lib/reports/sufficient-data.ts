import { cache } from 'react'
import { format } from 'date-fns'
import { createServiceClient } from '@/lib/supabase/server'
import { getComparisonRange } from './periods'
import type { PeriodRange, ComparisonMode, ComparisonAvailability } from './types'

/**
 * Earliest date for which the system has any usable booking/expense data.
 * Wraps the SQL `reports_data_start_date()` helper. Cached per-request.
 */
export const getDataStartDate = cache(async (): Promise<Date> => {
  const db = createServiceClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (db as any).rpc('reports_data_start_date')
  if (typeof data === 'string') return new Date(data + 'T00:00:00')
  // Fallback if RPC missing (migration not yet applied)
  return new Date('2026-05-01T00:00:00')
})

/**
 * Decide whether a comparison is meaningful for the given period + mode.
 *
 * Rules:
 * - The comparison range must START on or after `data_start_date`. If the
 *   prior window predates the system, deltas would compare against missing
 *   data and look like a wild swing — surface "—" with a tooltip instead.
 * - For mode='off' or unspecified, returns available=false silently.
 */
export async function isComparisonAvailable(
  period: PeriodRange,
  mode: Exclude<ComparisonMode, 'off'>,
): Promise<ComparisonAvailability> {
  const start = await getDataStartDate()
  const cmp = getComparisonRange(period, mode === 'both' ? 'previous_period' : mode)
  if (cmp.from < start) {
    const earliestNeeded = format(cmp.from, 'MMM yyyy')
    const reason = mode === 'year_over_year'
      ? `Need data from ${earliestNeeded} for year-over-year comparison`
      : `Need data from ${earliestNeeded} for previous-period comparison`
    return { available: false, reason }
  }
  return { available: true }
}

/**
 * Convenience: compute availability for both prev-period AND YoY at once.
 * Used by the hub's KPI strip so one call gates both comparisons.
 */
export async function computeAvailability(period: PeriodRange): Promise<{
  prev: ComparisonAvailability
  yoy:  ComparisonAvailability
}> {
  const [prev, yoy] = await Promise.all([
    isComparisonAvailable(period, 'previous_period'),
    isComparisonAvailable(period, 'year_over_year'),
  ])
  return { prev, yoy }
}
