import { requirePermission } from '@/lib/auth/permissions'
import { resolvePeriod } from '@/lib/reports/page-params'
import { computeAvailability } from '@/lib/reports/sufficient-data'
import { getDailyIncome, getPackageRevenue, getIndustryKpis } from '@/lib/queries/reports/income'
import { getHubTotals, getHubTotalsForComparison } from '@/lib/queries/reports/hub'
import { ReportShell } from '@/components/reports/ReportShell'
import { KpiCard } from '@/components/reports/KpiCard'
import { ChartCard } from '@/components/reports/ChartCard'
import { SimpleTable } from '@/components/reports/SimpleTable'
import { IncomeTrendChart } from '@/components/reports/income/IncomeTrendChart'
import { formatBDTCompact } from '@/lib/reports/format'
import { formatBDT } from '@/lib/formatters/currency'
import type { ComparisonMode } from '@/lib/reports/types'
import type { PackageRevenueRow } from '@/lib/queries/reports/income'

export const dynamic = 'force-dynamic'

interface PageProps { searchParams: { period?: string; from?: string; to?: string; compare?: string } }

export default async function IncomeReportPage({ searchParams }: PageProps) {
  await requirePermission('reports', 'read')
  const { preset, period, mode, customFrom, customTo } = resolvePeriod(searchParams)

  const [current, prev, yoy, daily, packages, industry, avail] = await Promise.all([
    getHubTotals(period),
    mode === 'previous_period' || mode === 'both' ? getHubTotalsForComparison(period, 'previous_period') : Promise.resolve(null),
    mode === 'year_over_year'  || mode === 'both' ? getHubTotalsForComparison(period, 'year_over_year')  : Promise.resolve(null),
    getDailyIncome(period),
    getPackageRevenue(period),
    getIndustryKpis(period),
    computeAvailability(period),
  ])

  const showPrev = (mode === 'previous_period' || mode === 'both') && avail.prev.available
  const showYoy  = (mode === 'year_over_year'  || mode === 'both') && avail.yoy.available
  const effectiveMode: ComparisonMode = showPrev && showYoy ? 'both' : showPrev ? 'previous_period' : showYoy ? 'year_over_year' : 'off'

  const avgBookingValue = current.booking_count > 0 ? Math.round(current.total_revenue / current.booking_count) : 0

  return (
    <ReportShell exportReportId="income" title="Income overview" subtitle="Revenue across rooms and extras" period={period} preset={preset} customFrom={customFrom} customTo={customTo} mode={mode}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <KpiCard label="Total revenue"  value={formatBDTCompact(current.total_revenue)}  raw={current.total_revenue}  prior={prev?.total_revenue ?? null}  yoy={yoy?.total_revenue ?? null}  mode={effectiveMode} />
        <KpiCard label="Room revenue"   value={formatBDTCompact(current.room_revenue)}   raw={current.room_revenue}   prior={prev?.room_revenue ?? null}   yoy={yoy?.room_revenue ?? null}   mode={effectiveMode} />
        <KpiCard label="Extras (rooms)" value={formatBDTCompact(current.extras_revenue)} raw={current.extras_revenue} prior={prev?.extras_revenue ?? null} yoy={yoy?.extras_revenue ?? null} mode={effectiveMode} />
        <KpiCard label="Coffee shop"    value={formatBDTCompact(current.coffee_shop_revenue)} raw={current.coffee_shop_revenue} prior={prev?.coffee_shop_revenue ?? null} yoy={yoy?.coffee_shop_revenue ?? null} mode={effectiveMode} />
        <KpiCard label="Bookings"       value={String(current.booking_count)}            raw={current.booking_count}  prior={prev?.booking_count ?? null}  yoy={yoy?.booking_count ?? null}  mode={effectiveMode} />
        <KpiCard label="Avg booking"    value={formatBDTCompact(avgBookingValue)}        mode="off" />
      </div>

      <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-3 text-xs text-indigo-900">
        <p className="font-semibold">💡 Revenue sources explained</p>
        <ul className="mt-1 list-disc list-inside space-y-0.5">
          <li><strong>Room revenue</strong> — booking room rate</li>
          <li><strong>Extras (rooms)</strong> — items charged to a guest&apos;s room and settled at checkout</li>
          <li><strong>Coffee shop</strong> — standalone walk-in sales paid directly at the coffee shop</li>
        </ul>
        <p className="mt-1.5">Same item sold twice (e.g. a Set Menu) appears as Coffee Shop revenue if a walk-in bought it, OR as Extras if it was added to a guest&apos;s bill — never both.</p>
      </div>

      <ChartCard title="Daily revenue" subtitle="Stacked: rooms · extras · coffee shop">
        <IncomeTrendChart data={daily} />
      </ChartCard>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-gray-900">Revenue by package</h3>
        <SimpleTable<PackageRevenueRow>
          rows={packages}
          columns={[
            { key: 'package_name',    label: 'Package' },
            { key: 'bookings',        label: 'Bookings',   align: 'right' },
            { key: 'total_revenue',   label: 'Revenue',    align: 'right', render: (r) => formatBDT(r.total_revenue) },
            { key: 'avg_per_booking', label: 'Avg / book', align: 'right', render: (r) => formatBDT(r.avg_per_booking) },
            { key: 'pct_of_total',    label: '% of total', align: 'right', render: (r) => `${r.pct_of_total.toFixed(1)}%` },
          ]}
          totals={{
            package_name: 'Total',
            bookings: packages.reduce((s, r) => s + r.bookings, 0),
            total_revenue: formatBDT(packages.reduce((s, r) => s + r.total_revenue, 0)),
          }}
        />
      </div>

      <details className="rounded-xl border border-gray-200 bg-white p-4">
        <summary className="cursor-pointer text-sm font-semibold text-gray-900">Advanced metrics (ADR, RevPAR, Occupancy)</summary>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <KpiCard label="ADR"     value={industry.adr    !== null ? formatBDT(industry.adr)    : '—'} note="Total room revenue / room-nights sold" mode="off" />
          <KpiCard label="RevPAR"  value={industry.revpar !== null ? formatBDT(industry.revpar) : '—'} note="Room revenue / available room-nights" mode="off" />
          <KpiCard label="Occupancy" value={industry.occupancy_pct !== null ? `${industry.occupancy_pct.toFixed(1)}%` : '—'} note={industry.total_rooms ? undefined : 'Set total_rooms in Settings → Property'} mode="off" />
        </div>
      </details>
    </ReportShell>
  )
}
