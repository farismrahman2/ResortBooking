import type { ChangeResult } from './types'

/**
 * Compute the absolute + percentage change between current and prior values.
 *
 * Conventions:
 * - prior === 0 (or null/undefined) → percent is null, direction reflects only sign of absolute
 * - both values 0 → 'flat'
 * - missing prior (undefined) → 'na'
 */
export function computeChange(current: number, prior: number | null | undefined): ChangeResult {
  if (prior === null || prior === undefined) {
    return { absolute: 0, percent: null, direction: 'na' }
  }
  const absolute = current - prior
  const percent = prior === 0 ? null : (absolute / prior) * 100
  let direction: ChangeResult['direction']
  if (absolute === 0) direction = 'flat'
  else if (absolute > 0) direction = 'up'
  else direction = 'down'
  return { absolute, percent, direction }
}

/**
 * Some metrics are "lower is better" (e.g. salary % of revenue, expense
 * spend). Use this to decide whether the change should be coloured green or
 * red. Returns 'good' | 'bad' | 'neutral'.
 */
export function changeSentiment(
  change: ChangeResult,
  lowerIsBetter: boolean = false,
): 'good' | 'bad' | 'neutral' {
  if (change.direction === 'flat' || change.direction === 'na') return 'neutral'
  const isUp = change.direction === 'up'
  if (lowerIsBetter) return isUp ? 'bad' : 'good'
  return isUp ? 'good' : 'bad'
}
