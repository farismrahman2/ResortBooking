/**
 * REVENUE DISPLAY — the revenue figure staff see.
 *
 * Only the admin sees real revenue. Everyone else sees, on the dashboard,
 * the month's room-booking revenue (lib/reports/booking-revenue.ts rules:
 * no-show = advance, cancelled = 0, by stay date) × the percentage the admin
 * set for that month. A month without its own percentage uses the latest
 * earlier one; with none at all, 100%.
 *
 * Screens that total real revenue are closed to everyone but the admin
 * (REAL_REVENUE_PREFIXES, enforced in middleware). Payroll and service
 * charge always use real figures — this is display only.
 */

export const canSeeRealRevenue = (role: string | null | undefined) => role === 'admin'

/** Pages and APIs that total real revenue — admin only. */
export const REAL_REVENUE_PREFIXES: readonly string[] = [
  '/analytics', '/booking-analytics',
  '/reports/income', '/reports/profitability', '/reports/weekly', '/reports/corporate',
  '/reports/checkout', '/reports/coffee-shop', '/reports/hr/salary-vs-revenue', '/reports/print',
  '/api/revenue', '/api/data-export/bookings', '/api/exports',
  '/settings/revenue-display',
  '/hr/sales', '/reports/dues',
]

/** Downloadable reports (/api/reports/[id]/export) that total revenue. */
export const REAL_REVENUE_REPORT_IDS: readonly string[] = [
  'income', 'income-by-package', 'income-by-day-of-week', 'profitability', 'cash-position',
  'hr-salary-vs-revenue', 'checkout-extras', 'checkout-top-items', 'checkout-by-room-type', 'coffee-shop',
]
/** Inside those, still open to the roles that had them: one day's takings by
 *  payment method, which the front desk reconciles each shift. */
export const REAL_REVENUE_EXCEPTIONS: readonly string[] = ['/reports/income/by-payment-method']

const under = (path: string, prefix: string) => path === prefix || path.startsWith(prefix + '/')

export function isRealRevenuePath(path: string): boolean {
  if (REAL_REVENUE_EXCEPTIONS.some((p) => under(path, p))) return false
  return REAL_REVENUE_PREFIXES.some((p) => under(path, p))
}

export interface DisplayRule { month: string; pct: number }   // month = 'YYYY-MM-01'

export const monthStart = (iso: string) => `${iso.slice(0, 7)}-01`

/** The percentage in force for a month: its own, else the latest earlier one, else 100. */
export function pctForMonth(rules: DisplayRule[], month: string): number {
  const m = monthStart(month)
  let best: DisplayRule | null = null
  for (const r of rules) {
    if (r.month <= m && (!best || r.month > best.month)) best = r
  }
  return best ? Number(best.pct) : 100
}

export const adjust = (real: number, pct: number) => Math.round(real * pct / 100)
