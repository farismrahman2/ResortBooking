import crypto from 'crypto'

/** Deterministic 8-char guest ID derived from phone (or name as fallback).
 *  Same guest across exports → same ID, so the AI can group rows without
 *  ever seeing the actual phone or name. */
export function hashGuestId(phone: string | null | undefined, fallback: string | null | undefined): string {
  const seed = (phone ?? '').replace(/\D/g, '') || (fallback ?? '').trim().toLowerCase()
  if (!seed) return 'GUEST_UNKNOWN'
  return 'GUEST_' + crypto.createHash('sha256').update(seed).digest('hex').slice(0, 8).toUpperCase()
}

/** RFC 4180 CSV escape. Strings with comma/quote/newline get wrapped in
 *  double-quotes, internal quotes doubled. Anything else passes through. */
export function csvCell(v: unknown): string {
  if (v === null || v === undefined) return ''
  const s = typeof v === 'string' ? v : String(v)
  if (/[",\r\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"'
  return s
}

/** Serialize an array of records to CSV. Column order = keys of the first
 *  record. All rows must have the same keys (TypeScript enforces it). */
export function toCsv<T extends object>(rows: T[]): string {
  if (rows.length === 0) return ''
  const cols = Object.keys(rows[0] as Record<string, unknown>)
  const lines = [cols.join(',')]
  for (const row of rows) {
    const r = row as Record<string, unknown>
    lines.push(cols.map((c) => csvCell(r[c])).join(','))
  }
  return lines.join('\r\n') + '\r\n'
}

export function csvHeadersOnly(cols: string[]): string {
  return cols.join(',') + '\r\n'
}
