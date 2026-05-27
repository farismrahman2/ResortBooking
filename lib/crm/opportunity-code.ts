/**
 * Generate an opportunity code: OPP-0001.
 * Race-safe via retry-on-UNIQUE in the action (mirrors account-code.ts).
 */
export function formatOpportunityCode(sequenceFromZero: number): string {
  return `OPP-${String(sequenceFromZero + 1).padStart(4, '0')}`
}
