import { buildPeriodRange } from './periods'
import type { ComparisonMode, PeriodPreset, PeriodRange } from './types'

const VALID_PRESETS: PeriodPreset[] = [
  'today', 'yesterday', 'this_week', 'last_week', 'this_month', 'last_month',
  'last_30_days', 'last_90_days', 'this_quarter', 'last_quarter', 'this_year', 'ytd', 'custom',
]
const VALID_MODES: ComparisonMode[] = ['off', 'previous_period', 'year_over_year', 'both']

export function pickPreset(s: string | undefined, fallback: PeriodPreset = 'this_month'): PeriodPreset {
  return VALID_PRESETS.includes(s as PeriodPreset) ? (s as PeriodPreset) : fallback
}

export function pickMode(s: string | undefined): ComparisonMode {
  return VALID_MODES.includes(s as ComparisonMode) ? (s as ComparisonMode) : 'off'
}

/** Guards against `new Date('nonsense')` reaching date-fns as Invalid Date. */
function parseDate(s: string | undefined): Date | undefined {
  if (!s) return undefined
  const d = new Date(s + 'T00:00:00')
  return Number.isNaN(d.getTime()) ? undefined : d
}

export function resolvePeriod(searchParams: Record<string, string | undefined>): {
  preset: PeriodPreset
  period: PeriodRange
  mode: ComparisonMode
  customFrom?: string
  customTo?: string
} {
  // If explicit dates are present, treat it as a custom range even when
  // `period` is absent. Previously ?from=…&to=… without period=custom fell
  // back to 'this_month' and the dates were silently ignored — a hand-typed
  // or shared report URL quietly showed the wrong window with no indication.
  const hasExplicitDates = !!(searchParams.from || searchParams.to)
  const preset = searchParams.period
    ? pickPreset(searchParams.period)
    : (hasExplicitDates ? 'custom' : pickPreset(undefined))
  const mode   = pickMode(searchParams.compare)
  const period = buildPeriodRange(preset, {
    from: parseDate(searchParams.from),
    to:   parseDate(searchParams.to),
  })
  return { preset, period, mode, customFrom: searchParams.from, customTo: searchParams.to }
}
