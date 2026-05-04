import {
  startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth,
  startOfQuarter, endOfQuarter, startOfYear, endOfYear,
  subDays, subWeeks, subMonths, subQuarters, subYears,
  differenceInCalendarDays, addDays, format,
} from 'date-fns'
import type { PeriodPreset, PeriodRange, Granularity, ComparisonMode } from './types'

/** Pick a sensible chart granularity from the period span. */
function granularityFromSpan(days: number): Granularity {
  if (days <= 1)   return 'day'
  if (days <= 31)  return 'day'
  if (days <= 90)  return 'week'
  if (days <= 366) return 'month'
  return 'month'
}

function range(from: Date, to: Date, label: string, granularity?: Granularity): PeriodRange {
  const f = startOfDay(from)
  const t = endOfDay(to)
  const days = differenceInCalendarDays(t, f) + 1
  return { from: f, to: t, label, granularity: granularity ?? granularityFromSpan(days) }
}

/**
 * Build a PeriodRange from a preset (or custom from/to). `anchor` defaults
 * to "now" — only relevant for relative presets.
 */
export function buildPeriodRange(
  preset: PeriodPreset,
  opts: { from?: Date; to?: Date; anchor?: Date } = {},
): PeriodRange {
  const anchor = opts.anchor ?? new Date()
  switch (preset) {
    case 'today':         return range(anchor, anchor, 'Today', 'day')
    case 'yesterday': {
      const y = subDays(anchor, 1)
      return range(y, y, 'Yesterday', 'day')
    }
    case 'this_week': {
      const f = startOfWeek(anchor, { weekStartsOn: 1 })
      return range(f, endOfWeek(anchor, { weekStartsOn: 1 }), 'This week', 'day')
    }
    case 'last_week': {
      const a = subWeeks(anchor, 1)
      const f = startOfWeek(a, { weekStartsOn: 1 })
      return range(f, endOfWeek(a, { weekStartsOn: 1 }), 'Last week', 'day')
    }
    case 'this_month':
      return range(startOfMonth(anchor), endOfMonth(anchor), format(anchor, 'MMMM yyyy'), 'day')
    case 'last_month': {
      const a = subMonths(anchor, 1)
      return range(startOfMonth(a), endOfMonth(a), format(a, 'MMMM yyyy'), 'day')
    }
    case 'last_30_days':
      return range(subDays(anchor, 29), anchor, 'Last 30 days', 'day')
    case 'last_90_days':
      return range(subDays(anchor, 89), anchor, 'Last 90 days', 'week')
    case 'this_quarter':
      return range(startOfQuarter(anchor), endOfQuarter(anchor),
        `Q${Math.floor(anchor.getMonth() / 3) + 1} ${anchor.getFullYear()}`, 'week')
    case 'last_quarter': {
      const a = subQuarters(anchor, 1)
      return range(startOfQuarter(a), endOfQuarter(a),
        `Q${Math.floor(a.getMonth() / 3) + 1} ${a.getFullYear()}`, 'week')
    }
    case 'this_year':
      return range(startOfYear(anchor), endOfYear(anchor), `${anchor.getFullYear()}`, 'month')
    case 'ytd':
      return range(startOfYear(anchor), anchor, `${anchor.getFullYear()} YTD`, 'month')
    case 'custom': {
      if (!opts.from || !opts.to) throw new Error('custom period requires from and to')
      const lbl = `${format(opts.from, 'd MMM yyyy')} – ${format(opts.to, 'd MMM yyyy')}`
      return range(opts.from, opts.to, lbl)
    }
  }
}

/**
 * Comparison range derivation.
 * - previous_period: same length, immediately preceding the current period.
 * - year_over_year:  same calendar dates one year earlier.
 */
export function getComparisonRange(period: PeriodRange, mode: 'previous_period' | 'year_over_year'): PeriodRange {
  if (mode === 'year_over_year') {
    const f = subYears(period.from, 1)
    const t = subYears(period.to, 1)
    return { from: startOfDay(f), to: endOfDay(t), label: `${period.label} (YoY)`, granularity: period.granularity }
  }
  // previous_period
  const days = differenceInCalendarDays(period.to, period.from) + 1
  const t = subDays(period.from, 1)
  const f = subDays(t, days - 1)
  return { from: startOfDay(f), to: endOfDay(t), label: `Previous ${days}d`, granularity: period.granularity }
}

/** Format a single Date as ISO YYYY-MM-DD without timezone surprises. */
export function toIsoDate(d: Date): string {
  return format(d, 'yyyy-MM-dd')
}

/** Number of days the period covers (inclusive). */
export function periodLengthDays(period: PeriodRange): number {
  return differenceInCalendarDays(period.to, period.from) + 1
}

/** Iterate every day in the period — useful for client-side zero-fill. */
export function* eachDay(period: PeriodRange): Generator<Date> {
  let d = period.from
  while (d <= period.to) {
    yield d
    d = addDays(d, 1)
  }
}
