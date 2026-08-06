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
      // Ends TODAY, not at the end of the week. Running to a future date meant
      // a partial current period was compared against a complete prior one,
      // so every metric showed a collapse that hadn't happened.
      const f = startOfWeek(anchor, { weekStartsOn: 1 })
      return range(f, anchor, 'This week', 'day')
    }
    case 'last_week': {
      const a = subWeeks(anchor, 1)
      const f = startOfWeek(a, { weekStartsOn: 1 })
      return range(f, endOfWeek(a, { weekStartsOn: 1 }), 'Last week', 'day')
    }
    case 'this_month':
      // to = today, not end of month — see the note on 'this_week'.
      return range(startOfMonth(anchor), anchor, format(anchor, 'MMMM yyyy'), 'day')
    case 'last_month': {
      const a = subMonths(anchor, 1)
      return range(startOfMonth(a), endOfMonth(a), format(a, 'MMMM yyyy'), 'day')
    }
    case 'last_30_days':
      return range(subDays(anchor, 29), anchor, 'Last 30 days', 'day')
    case 'last_90_days':
      return range(subDays(anchor, 89), anchor, 'Last 90 days', 'week')
    case 'this_quarter':
      return range(startOfQuarter(anchor), anchor,
        `Q${Math.floor(anchor.getMonth() / 3) + 1} ${anchor.getFullYear()}`, 'week')
    case 'last_quarter': {
      const a = subQuarters(anchor, 1)
      return range(startOfQuarter(a), endOfQuarter(a),
        `Q${Math.floor(a.getMonth() / 3) + 1} ${a.getFullYear()}`, 'week')
    }
    case 'this_year':
      return range(startOfYear(anchor), anchor, `${anchor.getFullYear()}`, 'month')
    case 'ytd':
      return range(startOfYear(anchor), anchor, `${anchor.getFullYear()} YTD`, 'month')
    case 'custom': {
      // Must not throw on a half-specified range. Picking "Custom range…" from
      // the dropdown sets period=custom BEFORE either date exists, and picking
      // only a From leaves To empty — this used to crash the whole report page
      // on the most ordinary path a user takes to choose dates.
      // Fall back per-side instead: missing From = start of this month,
      // missing To = today.
      const from = opts.from ?? startOfMonth(anchor)
      const to   = opts.to   ?? anchor
      // Tolerate a reversed range rather than silently returning nothing.
      const [f, t] = from <= to ? [from, to] : [to, from]
      const lbl = `${format(f, 'd MMM yyyy')} – ${format(t, 'd MMM yyyy')}`
      return range(f, t, lbl)
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

  // Month-aligned periods compare against the SAME DAYS of the previous month,
  // not a sliding window of equal length. Sliding meant June (30 days) was
  // compared against 2–31 May rather than May, so month-over-month deltas were
  // wrong for every month except the 31-day ones — and "1–6 Aug" landed on
  // "26–31 Jul" instead of "1–6 Jul", which is the comparison a manager means.
  if (period.from.getDate() === 1) {
    const prevStart = startOfMonth(subMonths(period.from, 1))
    const prevMonthEnd = endOfMonth(prevStart)
    // Month-to-date: mirror the same day count, clamped to the shorter month
    // (so 1–31 Mar compares against all of Feb rather than spilling into Mar).
    const mirroredEnd = addDays(prevStart, days - 1)
    const t = mirroredEnd > prevMonthEnd ? prevMonthEnd : mirroredEnd
    return {
      from: startOfDay(prevStart),
      to:   endOfDay(t),
      label: `${format(prevStart, 'MMM')} 1–${format(t, 'd')}`,
      granularity: period.granularity,
    }
  }

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
