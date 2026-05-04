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

export function resolvePeriod(searchParams: Record<string, string | undefined>): {
  preset: PeriodPreset
  period: PeriodRange
  mode: ComparisonMode
  customFrom?: string
  customTo?: string
} {
  const preset = pickPreset(searchParams.period)
  const mode   = pickMode(searchParams.compare)
  const period = buildPeriodRange(preset, {
    from: searchParams.from ? new Date(searchParams.from + 'T00:00:00') : undefined,
    to:   searchParams.to   ? new Date(searchParams.to   + 'T00:00:00') : undefined,
  })
  return { preset, period, mode, customFrom: searchParams.from, customTo: searchParams.to }
}
