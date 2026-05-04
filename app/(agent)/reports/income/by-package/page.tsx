import { requirePermission } from '@/lib/auth/permissions'
import { resolvePeriod } from '@/lib/reports/page-params'
import { getPackageRevenue, type PackageRevenueRow } from '@/lib/queries/reports/income'
import { ReportShell } from '@/components/reports/ReportShell'
import { ChartCard } from '@/components/reports/ChartCard'
import { SimpleTable } from '@/components/reports/SimpleTable'
import { PackageBarChart } from '@/components/reports/income/PackageBarChart'
import { formatBDT } from '@/lib/formatters/currency'

export const dynamic = 'force-dynamic'

interface PageProps { searchParams: { period?: string; from?: string; to?: string; compare?: string } }

export default async function ByPackagePage({ searchParams }: PageProps) {
  await requirePermission('reports', 'read')
  const { preset, period, mode, customFrom, customTo } = resolvePeriod(searchParams)
  const rows = await getPackageRevenue(period)

  return (
    <ReportShell exportReportId="income-by-package" title="Revenue by package" subtitle="Room type / package performance" period={period} preset={preset} customFrom={customFrom} customTo={customTo} mode={mode}>
      <ChartCard title="Top packages by revenue">
        <PackageBarChart data={rows.slice(0, 12)} />
      </ChartCard>
      <SimpleTable<PackageRevenueRow>
        rows={rows}
        columns={[
          { key: 'package_name',    label: 'Package' },
          { key: 'bookings',        label: 'Bookings',   align: 'right' },
          { key: 'total_revenue',   label: 'Revenue',    align: 'right', render: (r) => formatBDT(r.total_revenue) },
          { key: 'avg_per_booking', label: 'Avg / book', align: 'right', render: (r) => formatBDT(r.avg_per_booking) },
          { key: 'pct_of_total',    label: '% of total', align: 'right', render: (r) => `${r.pct_of_total.toFixed(1)}%` },
        ]}
        totals={{
          package_name: 'Total',
          bookings: rows.reduce((s, r) => s + r.bookings, 0),
          total_revenue: formatBDT(rows.reduce((s, r) => s + r.total_revenue, 0)),
          pct_of_total: '100.0%',
        }}
      />
    </ReportShell>
  )
}
