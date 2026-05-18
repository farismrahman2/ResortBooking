/**
 * Reports module — shared types.
 *
 * Reports are read-only aggregations across bookings, expenses, HR, and
 * checkout. Every report accepts a `PeriodRange` and an optional
 * `ComparisonMode`; the UI shells render deltas vs prior period and/or
 * year-over-year when comparison is on AND enough historical data exists.
 */

export type Granularity = 'day' | 'week' | 'month' | 'quarter' | 'year' | 'custom'

export interface PeriodRange {
  /** Inclusive start, set to 00:00 local. */
  from: Date
  /** Inclusive end, set to 23:59:59.999 local. */
  to: Date
  /** Display label, e.g. "May 2026" or "Last 30 days". */
  label: string
  /** How the period was constructed — used by UI to pick chart granularity. */
  granularity: Granularity
}

export type PeriodPreset =
  | 'today'
  | 'yesterday'
  | 'this_week'
  | 'last_week'
  | 'this_month'
  | 'last_month'
  | 'last_30_days'
  | 'last_90_days'
  | 'this_quarter'
  | 'last_quarter'
  | 'this_year'
  | 'ytd'
  | 'custom'

export type ComparisonMode = 'off' | 'previous_period' | 'year_over_year' | 'both'

export interface ChangeResult {
  /** current - prior; same units as inputs. */
  absolute: number
  /** Null when prior is 0 (division by zero). */
  percent: number | null
  direction: 'up' | 'down' | 'flat' | 'na'
}

export interface ComparisonAvailability {
  available: boolean
  /** Human-readable explanation when unavailable. */
  reason?: string
}

/** Generic envelope for a report's aggregated data + comparison. */
export interface ReportData<T> {
  current:  T
  prior?:   T | null
  yoy?:     T | null
  period:   PeriodRange
  mode:     ComparisonMode
}
