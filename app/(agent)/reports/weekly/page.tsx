import Link from 'next/link'
import { format, startOfWeek, endOfWeek, addDays, subMonths } from 'date-fns'
import { AlertTriangle, Info } from 'lucide-react'
import { requirePermission, hasPermission } from '@/lib/auth/permissions'
import { Topbar } from '@/components/layout/Topbar'
import { buildPeriodRange } from '@/lib/reports/periods'
import { getHubTotals } from '@/lib/queries/reports/hub'
import { getOccupancyByDay } from '@/lib/queries/reports/operations'
import { getSalaryVsRevenue } from '@/lib/queries/reports/hr'
import { getTopChargeItems } from '@/lib/queries/reports/checkout'
import { KpiCard } from '@/components/reports/KpiCard'
import { ChartCard } from '@/components/reports/ChartCard'
import { SimpleTable } from '@/components/reports/SimpleTable'
import { WeeklyTrendChart } from '@/components/reports/weekly/WeeklyTrendChart'
import { detectAnomalies } from '@/lib/reports/anomalies'
import { formatBDT } from '@/lib/formatters/currency'
import { formatBDTCompact } from '@/lib/reports/format'
import type { TopItemRow } from '@/lib/queries/reports/checkout'

export const dynamic = 'force-dynamic'

export default async function WeeklySummaryPage({ searchParams }: { searchParams: { week?: string } }) {
  await requirePermission('reports', 'read')

  // The chosen week (any date inside it, ?week=yyyy-mm-dd); last week by default. Mon–Sun.
  const today = new Date()
  const picked = searchParams.week && /^\d{4}-\d{2}-\d{2}$/.test(searchParams.week) ? new Date(searchParams.week + 'T00:00:00') : null
  const lastWeekAnchor = picked && !Number.isNaN(picked.getTime()) ? picked : addDays(today, -7)
  const weekStart = startOfWeek(lastWeekAnchor, { weekStartsOn: 1 })
  const weekEnd   = endOfWeek(lastWeekAnchor,   { weekStartsOn: 1 })
  const period = buildPeriodRange('custom', { from: weekStart, to: weekEnd })
  const monthAgoPeriod = buildPeriodRange('custom', { from: subMonths(weekStart, 1), to: subMonths(weekEnd, 1) })

  // Last 8 weeks of net for the mini trend
  const last8WeeksFrom = startOfWeek(addDays(today, -8 * 7), { weekStartsOn: 1 })
  const last8WeeksTo   = endOfWeek(today, { weekStartsOn: 1 })

  const [current, monthAgo, occ, hrSalary, topItems, hrAccess, checkoutAccess] = await Promise.all([
    getHubTotals(period),
    getHubTotals(monthAgoPeriod),
    getOccupancyByDay(period),
    hasPermission('hr', 'read').then((ok) => ok ? getSalaryVsRevenue(buildPeriodRange('custom', { from: weekStart, to: weekEnd })) : []),
    hasPermission('checkout', 'read').then((ok) => ok ? getTopChargeItems(period, 5) : []),
    hasPermission('hr', 'read'),
    hasPermission('checkout', 'read'),
  ])

  // Per-week net for mini trend (8 buckets)
  const trendBuckets: Array<{ week_label: string; net: number }> = []
  for (let i = 7; i >= 0; i--) {
    const ws = startOfWeek(addDays(today, -i * 7), { weekStartsOn: 1 })
    const we = endOfWeek(addDays(today, -i * 7),   { weekStartsOn: 1 })
    const p = buildPeriodRange('custom', { from: ws, to: we })
    const t = await getHubTotals(p)
    trendBuckets.push({ week_label: format(ws, "d MMM"), net: t.net })
  }

  // Compute weekend occupancy floor
  const weekendDays = occ.filter((d) => {
    const dow = new Date(d.date + 'T00:00:00').getDay()
    return dow === 0 || dow === 6
  })
  const weekendFloor = weekendDays.length > 0 ? Math.min(...weekendDays.map((d) => d.occupancy_pct ?? 100)) : null

  const salaryPct = (hrSalary as any[]).find((r) => r.payroll_total !== null)?.salary_pct ?? null  // eslint-disable-line @typescript-eslint/no-explicit-any

  const anomalies = detectAnomalies({
    current, monthAgo,
    salaryPct,
    weekendOccupancyMin: weekendFloor,
  })

  const topItem = (topItems as TopItemRow[])[0]

  const start = format(weekStart, 'd MMM')
  const end   = format(weekEnd,   'd MMM yyyy')

  return (
    <div className="flex h-full flex-col">
      <Topbar title={`Week of ${start} – ${end}`} subtitle={picked ? 'The chosen week at a glance' : 'Last week at a glance'} />
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 space-y-5 print:overflow-visible">
        {/* Week selector: previous / next, or pick any day in the week. */}
        <form action="/reports/weekly" className="flex flex-wrap items-end gap-2 rounded-xl border border-gray-200 bg-white p-3 print:hidden">
          <Link href={`/reports/weekly?week=${format(addDays(weekStart, -7), 'yyyy-MM-dd')}`}
            className="inline-flex min-h-[40px] items-center rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700 hover:bg-gray-50">← Previous week</Link>
          <label className="block">
            <span className="mb-0.5 block text-[11px] font-semibold uppercase tracking-wide text-gray-500">Any day in the week</span>
            <input type="date" name="week" defaultValue={format(weekStart, 'yyyy-MM-dd')}
              className="min-h-[40px] rounded-lg border border-gray-300 bg-white px-2.5 text-sm focus:border-forest-600 focus:outline-none focus:ring-2 focus:ring-forest-200" />
          </label>
          <button type="submit" className="inline-flex min-h-[40px] items-center rounded-lg bg-forest-700 px-4 text-sm font-medium text-white">Show</button>
          {addDays(weekStart, 7) <= today && (
            <Link href={`/reports/weekly?week=${format(addDays(weekStart, 7), 'yyyy-MM-dd')}`}
              className="inline-flex min-h-[40px] items-center rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700 hover:bg-gray-50">Next week →</Link>
          )}
          <span className="ml-auto text-xs text-gray-500">Mon–Sun</span>
        </form>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <KpiCard label="Bookings"         value={String(current.booking_count)} mode="off" />
          <KpiCard label="Revenue"          value={formatBDTCompact(current.total_revenue)} mode="off" />
          <KpiCard label="Expenses"         value={formatBDTCompact(current.total_expenses)} mode="off" invertColour />
          <KpiCard label="Net"              value={formatBDTCompact(current.net)} emphasis={current.net >= 0 ? 'positive' : 'negative'} mode="off" />
          <KpiCard label="Avg occupancy"    value={current.avg_occupancy_pct == null ? '—' : `${current.avg_occupancy_pct.toFixed(1)}%`} mode="off" />
          <KpiCard label="Salary % rev"     value={salaryPct === null ? 'Pending' : `${salaryPct.toFixed(1)}%`}
            note={salaryPct === null ? 'Last week\'s payroll not finalized' : undefined} mode="off" />
        </div>

        {/* Anomaly callouts */}
        <div className="space-y-2">
          {anomalies.length === 0 ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900 inline-flex items-center gap-2">
              <Info size={14} /> No anomalies this week — looks healthy.
            </div>
          ) : anomalies.map((a, i) => (
            <div key={i} className={`flex items-start gap-2 rounded-xl border p-3 text-sm ${
              a.severity === 'alert' ? 'border-rose-200 bg-rose-50 text-rose-900'
              : a.severity === 'warn' ? 'border-amber-200 bg-amber-50 text-amber-900'
              : 'border-indigo-200 bg-indigo-50 text-indigo-900'
            }`}>
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <div className="flex-1">
                {a.message}
                {a.link && <Link href={a.link} className="ml-2 underline font-semibold">Open detail →</Link>}
              </div>
            </div>
          ))}
        </div>

        <ChartCard title="Net — last 8 weeks">
          <WeeklyTrendChart data={trendBuckets} />
        </ChartCard>

        {checkoutAccess && (
          <div>
            <h3 className="mb-2 text-sm font-semibold text-gray-900">Top items this week</h3>
            <SimpleTable<TopItemRow>
              rows={topItems as TopItemRow[]}
              emptyMessage="No finalized checkouts this week."
              columns={[
                { key: 'item_name',     label: 'Item' },
                { key: 'times_sold',    label: 'Sold', align: 'right' },
                { key: 'total_revenue', label: 'Revenue', align: 'right', render: (r) => formatBDT(r.total_revenue) },
              ]}
            />
            {topItem && (
              <p className="mt-2 text-xs text-gray-500">Top: <strong>{topItem.item_name}</strong> — {topItem.times_sold} sold</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
