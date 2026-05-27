/**
 * Per-type, per-day sequential movement number: <PREFIX>-YYYYMMDD-NNN.
 * Caller passes the count of movements of this type already on `date`.
 * Race-safe via retry-on-UNIQUE in the action (mirrors sale-number.ts).
 *
 * Phase 2+ uses this for receipts/issues/transfers/adjustments and Phase 3
 * for counts.
 */
export type MovementNumberType = 'receipt' | 'issue' | 'transfer' | 'adjustment' | 'count'

const PREFIX: Record<MovementNumberType, string> = {
  receipt:    'RCP',
  issue:      'ISS',
  transfer:   'TRF',
  adjustment: 'ADJ',
  count:      'CNT',
}

export function formatMovementNumber(
  type: MovementNumberType,
  date: string,            // YYYY-MM-DD
  sequenceFromZero: number,
): string {
  const compact = date.replace(/-/g, '')
  const seq = String(sequenceFromZero + 1).padStart(3, '0')
  return `${PREFIX[type]}-${compact}-${seq}`
}
