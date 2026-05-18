import type { ChangeResult } from './types'

/** Compact BDT for KPIs: 12.3K, 1.2M. Falls back to full formatBDT for small values. */
export function formatBDTCompact(amount: number | null | undefined): string {
  if (amount == null) return '—'
  const n = Math.abs(amount)
  if (n >= 10_000_000) return `${(amount / 10_000_000).toFixed(1)}Cr ৳`
  if (n >= 100_000)    return `${(amount / 100_000).toFixed(1)}L ৳`
  if (n >= 1_000)      return `${(amount / 1_000).toFixed(1)}K ৳`
  return `${Math.round(amount).toLocaleString('en-IN')} ৳`
}

/** Percentage with sign and 1 decimal. Returns "—" for null. */
export function formatPct(pct: number | null | undefined, opts: { signed?: boolean } = {}): string {
  if (pct == null) return '—'
  const sign = opts.signed && pct > 0 ? '+' : ''
  return `${sign}${pct.toFixed(1)}%`
}

/** Compact human change string: "+12.3% (▲ 1.2K ৳)" or "—" when na. */
export function formatChange(change: ChangeResult, opts: { currency?: boolean } = {}): string {
  if (change.direction === 'na') return '—'
  if (change.percent === null) {
    // Prior was zero — surface absolute only
    const abs = opts.currency ? formatBDTCompact(change.absolute) : Math.round(change.absolute).toLocaleString('en-IN')
    return `${change.direction === 'up' ? '+' : ''}${abs}`
  }
  const arrow = change.direction === 'up' ? '▲' : change.direction === 'down' ? '▼' : '•'
  const pctStr = formatPct(change.percent, { signed: true })
  return `${arrow} ${pctStr}`
}
