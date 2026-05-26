/**
 * BD mobile number helpers. Stored raw (digits, possibly with hyphen);
 * displayed as 01XXX-XXXXXX.
 */

/** Strip everything but digits. */
export function normalizeBdPhone(raw: string): string {
  return raw.replace(/\D/g, '')
}

/** Format for display: 01712345678 → 01712-345678. Returns input unchanged if not 11 digits. */
export function formatBdPhone(raw: string | null | undefined): string {
  if (!raw) return ''
  const digits = normalizeBdPhone(raw)
  if (digits.length !== 11) return raw
  return `${digits.slice(0, 5)}-${digits.slice(5)}`
}
