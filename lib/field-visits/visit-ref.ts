/**
 * Generate a visit ref: GCR-FV-00001.
 * Caller passes the count of visits already created; returns the next ref.
 * Race-safe via retry-on-UNIQUE in the action (mirrors lib/crm/account-code.ts).
 */
export function formatVisitRef(sequenceFromZero: number): string {
  return `GCR-FV-${String(sequenceFromZero + 1).padStart(5, '0')}`
}

/**
 * OUT.02 — `nothing` is mutually exclusive with the other materials options.
 * Selecting `nothing` clears the rest; selecting anything else clears `nothing`.
 * Shared by the wizard and any server-side normalisation so the rule can't
 * drift between the two.
 */
export function normaliseMaterials(next: string[], justToggled?: string): string[] {
  if (justToggled === 'nothing' && next.includes('nothing')) return ['nothing']
  if (justToggled && justToggled !== 'nothing') return next.filter((v) => v !== 'nothing')
  // No hint about what changed — if `nothing` is present alongside others, it wins.
  if (next.includes('nothing') && next.length > 1) return ['nothing']
  return next
}
