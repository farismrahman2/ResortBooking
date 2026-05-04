import { requirePermission } from '@/lib/auth/permissions'
import { resolvePeriod } from '@/lib/reports/page-params'
import { getOccupancyByDay, getPickupPace, type PickupWeekRow } from '@/lib/queries/reports/operations'
import { getIndustryKpis } from '@/lib/queries/reports/income'
import { ReportShell } from '@/components/reports/ReportShell'
import { KpiCard } from '@/components/reports/KpiCard'
import { ChartCard } from '@/components/reports/ChartCard'
import { SimpleTable } from '@/components/reports/SimpleTable'
import { OccupancyHeatmap } from '@/components/reports/operations/OccupancyHeatmap'
import { PickupPaceChart } from '@/components/reports/operations/PickupPaceChart'
import { formatBDT } from '@/lib/formatters/currency'

export const dynamic = 'force-dynamic'

interface PageProps { searchParams: { period?: string; from?: string; to?: string; compare?: string } }

export default async function OperationsReportPage({ searchParams }: PageProps) {
  await requirePermission('reports', 'read')
  const { preset, period, mode, customFrom, customTo } = resolvePeriod(searchParams)
  const [days, pickup, industry] = await Promise.all([
    getOccupancyByDay(period),
    getPickupPace(),
    getIndustryKpis(period),
  ])

  const pcts = days.map((d) => d.occupancy_pct ?? 0)
  const peak = pcts.length > 0 ? Math.max(...pcts) : 0
  const low  = pcts.length > 0 ? Math.min(...pcts) : 0
  const avg  = pcts.length > 0 ? pcts.reduce((s, n) => s + n, 0) / pcts.length : 0
  const fullDays = days.filter((d) => d.total_rooms > 0 && d.rooms_occupied >= d.total_rooms).length

  return (
    <ReportShell title="Operations" subtitle="Occupancy + pickup pace" period={period} preset={preset} customFrom={customFrom} customTo={customTo} mode={mode}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <KpiCard label="Avg occupancy" value={`${avg.toFixed(1)}%`} mode="off" />
        <KpiCard label="Peak day"      value={`${peak.toFixed(1)}%`} mode="off" />
        <KpiCard label="Lowest day"    value={`${low.toFixed(1)}%`} mode="off" />
        <KpiCard label="Days fully booked" value={String(fullDays)} mode="off" />
      </div>
      <ChartCard title="Occupancy heatmap">
        <OccupancyHeatmap days={days} />
      </ChartCard>
      <ChartCard title="Pickup pace — next 8 weeks">
        <PickupPaceChart data={pickup} />
      </ChartCard>
      <SimpleTable<PickupWeekRow>
        rows={pickup}
        columns={[
          { key: 'week_label',      label: 'Week' },
          { key: 'rooms_booked',    label: 'Rooms booked',    align: 'right' },
          { key: 'rooms_available', label: 'Rooms available', align: 'right' },
          { key: 'pct_booked',      label: '% booked',        align: 'right', render: (r) => r.pct_booked === null ? '—' : `${r.pct_booked.toFixed(1)}%` },
        ]}
      />
      <details className="rounded-xl border border-gray-200 bg-white p-4">
        <summary className="cursor-pointer text-sm font-semibold text-gray-900">Advanced metrics (ADR, RevPAR)</summary>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <KpiCard label="ADR"    value={industry.adr    !== null ? formatBDT(industry.adr)    : '—'} mode="off" />
          <KpiCard label="RevPAR" value={industry.revpar !== null ? formatBDT(industry.revpar) : '—'} mode="off" />
          <KpiCard label="Room-nights sold / available"
            value={`${industry.total_room_nights_sold} / ${industry.total_available_room_nights}`} mode="off" />
        </div>
      </details>
    </ReportShell>
  )
}
