/**
 * Currency formatter — BDT (৳)
 */

/**
 * Format a BDT integer amount as ৳X,XXX
 * e.g. formatBDT(15000) → '৳15,000'
 */
export function formatBDT(amount: number): string {
  if (isNaN(amount) || amount === null) return '৳0'
  return '৳' + Math.round(amount).toLocaleString('en-BD')
}

/**
 * Format as signed BDT (for discounts)
 * e.g. formatBDTSigned(-2000) → '-৳2,000'
 */
export function formatBDTSigned(amount: number): string {
  const abs = Math.abs(amount)
  const formatted = '৳' + Math.round(abs).toLocaleString('en-BD')
  return amount < 0 ? `-${formatted}` : formatted
}

/**
 * Parse a BDT string back to number (strips ৳ and commas)
 */
export function parseBDT(value: string): number {
  return parseInt(value.replace(/[৳,\s]/g, ''), 10) || 0
}
