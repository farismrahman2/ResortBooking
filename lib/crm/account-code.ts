/**
 * Generate an account code: ACC-0001.
 * Caller passes the count of accounts already created; returns the next code.
 * Race-safe via retry-on-UNIQUE in the action (mirrors sale-number.ts).
 */
export function formatAccountCode(sequenceFromZero: number): string {
  return `ACC-${String(sequenceFromZero + 1).padStart(4, '0')}`
}
