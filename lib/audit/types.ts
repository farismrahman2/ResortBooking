/**
 * AI AUDIT — shared shapes. Checks (lib/audit/checks/*) are plain functions
 * over rows: code finds the facts, the AI only explains them.
 */

export type AuditArea = 'bookings' | 'expenses' | 'inventory'
export type Severity = 'high' | 'medium' | 'low'

export interface FindingExample {
  ref:    string           // booking #, expense date+payee, item name…
  detail: string           // one short line
  link?:  string           // app path to open it
}

export interface Finding {
  id:       string          // stable check id, e.g. "booking-advance-over-total"
  area:     AuditArea
  severity: Severity
  title:    string          // plain-language headline
  count:    number
  /** ৳ at stake, when it can be measured (shown to the admin only). */
  amount?:  number
  examples: FindingExample[]
}

export const MAX_EXAMPLES = 8

/** Build a finding from matched rows; null when nothing matched. */
export function finding(
  base: Omit<Finding, 'count' | 'examples'>, examples: FindingExample[], amount?: number,
): Finding | null {
  if (examples.length === 0) return null
  return { ...base, count: examples.length, examples: examples.slice(0, MAX_EXAMPLES), ...(amount !== undefined ? { amount: Math.round(amount) } : {}) }
}

export const daysBetween = (a: string, b: string) =>
  Math.round((Date.parse(`${b.slice(0, 10)}T00:00:00Z`) - Date.parse(`${a.slice(0, 10)}T00:00:00Z`)) / 86400000)
