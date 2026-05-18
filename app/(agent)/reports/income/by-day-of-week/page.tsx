import { requirePermission } from '@/lib/auth/permissions'
import { resolvePeriod } from '@/lib/reports/page-params'
import { getDayOfWeekStats, type DowRow } from '@/lib/queries/reports/income'
import { ReportShell } from '@/components/reports/ReportShell'
import { ChartCard } from '@/components/reports/ChartCard'
import { SimpleTable } from '@/components/reports/SimpleTable'
import { DowChart } from '@/components/reports/income/DowChart'
import { formatBDT } from '@/lib/formatters/currency'

export const dynamic = 'force-dynamic'

interface PageProps { searchParams: { period?: string; from?: string; to?: string; compare?: string } }

export default async function DayOfWeekPage({ searchParams }: PageProps) {
  await requirePermission('reports', 'read')
  const { preset, period, mode, customFrom, customTo } = resolvePeriod(searchParams)
  const rows = await getDayOfWeekStats(period)

  return (
    <ReportShell exportReportId="income-by-day-of-week" title="Day-of-week pattern" subtitle="Weekday vs weekend revenue + occupancy" period={period} preset={preset} customFrom={customFrom} customTo={customTo} mode={mode}>
      <ChartCard title="Avg revenue per day & occupancy">
        <DowChart data={rows} />
      </ChartCard>
      <SimpleTable<DowRow>
        rows={rows}
        columns={[
          { key: 'label',               label: 'Day' },
          { key: 'days_in_period',      label: 'Days in period', align: 'right' },
          { key: 'total_revenue',       label: 'Total revenue',  align: 'right', render: (r) => formatBDT(r.total_revenue) },
          { key: 'bookings',            label: 'Bookings',       align: 'right' },
          { key: 'avg_revenue_per_day', label: 'Avg / day',      align: 'right', render: (r) => formatBDT(r.avg_revenue_per_day) },
          { key: 'avg_occupancy_pct',   label: 'Avg occupancy',  align: 'right', render: (r) => `${r.avg_occupancy_pct.toFixed(1)}%` },
        ]}
      />
    </ReportShell>
  )
}
