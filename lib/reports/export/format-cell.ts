import { format } from 'date-fns'
import type { CellFormat } from './types'

export function formatCell(v: unknown, fmt: CellFormat | undefined): string {
  if (v === null || v === undefined || v === '') return ''
  switch (fmt) {
    case 'currency': return Number(v).toLocaleString('en-IN', { maximumFractionDigits: 2 })
    case 'percent':  return `${Number(v).toFixed(1)}%`
    case 'number':   return Number(v).toLocaleString('en-IN')
    case 'date':     return format(new Date(String(v)), 'd MMM yyyy')
    default:         return String(v)
  }
}

/** Plain numeric value (or undefined) so xlsx can store it as a number cell. */
export function rawNumber(v: unknown): number | undefined {
  if (v === null || v === undefined || v === '') return undefined
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}
