/**
 * Generate a per-day sequential sale number: CS-YYYYMMDD-NNN.
 * Caller passes the count of sales already on `saleDate`. Returns the next
 * number. Race-safety: the action wraps INSERT in a small retry loop that
 * re-queries the count on UNIQUE-violation.
 */
export function formatSaleNumber(saleDate: string, sequenceFromZero: number): string {
  const compact = saleDate.replace(/-/g, '')
  const seq = String(sequenceFromZero + 1).padStart(3, '0')
  return `CS-${compact}-${seq}`
}
