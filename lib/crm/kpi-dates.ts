/**
 * KPI period windows relative to a rep's sales_start_date. (Phase 4 uses this.)
 * Each window starts at sales_start_date and ends at start + N days, capped
 * at today. dayInPeriod = how far into the window we currently are, used for
 * pro-rated red/green status.
 */
export interface KpiWindow { from: string; to: string; dayInPeriod: number; periodDays: number }

function iso(d: Date): string {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function getKpiPeriod(salesStartDate: string, periodDays: 30 | 60 | 90, now = new Date()): KpiWindow {
  const start = new Date(salesStartDate + 'T00:00:00')
  const end = new Date(start); end.setDate(end.getDate() + periodDays)
  const today = new Date(iso(now) + 'T00:00:00')
  const cappedEnd = today < end ? today : end
  const dayInPeriod = Math.min(
    periodDays,
    Math.max(0, Math.round((cappedEnd.getTime() - start.getTime()) / 86400000)),
  )
  return { from: iso(start), to: iso(end), dayInPeriod, periodDays }
}

export function getKpiPeriods(salesStartDate: string, now = new Date()) {
  return {
    day30: getKpiPeriod(salesStartDate, 30, now),
    day60: getKpiPeriod(salesStartDate, 60, now),
    day90: getKpiPeriod(salesStartDate, 90, now),
  }
}
