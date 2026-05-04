import { requirePermission, hasPermission } from '@/lib/auth/permissions'
import { resolvePeriod } from '@/lib/reports/page-params'
import { getExtrasOverview } from '@/lib/queries/reports/checkout'
import { ReportShell } from '@/components/reports/ReportShell'
import { KpiCard } from '@/components/reports/KpiCard'
import { ChartCard } from '@/components/reports/ChartCard'
import { SimpleTable } from '@/components/reports/SimpleTable'
import { ExtrasTrendChart } from '@/components/reports/checkout/ExtrasTrendChart'
import { CategoryPieChart } from '@/components/reports/checkout/CategoryPieChart'
import { formatBDTCompact } from '@/lib/reports/format'
import { formatBDT } from '@/lib/formatters/currency'

export const dynamic = 'force-dynamic'

interface PageProps { searchParams: { period?: string; from?: string; to?: string; compare?: string } }

export default async function ExtrasRevenuePage({ searchParams }: PageProps) {
  await requirePermission('reports', 'read')
  const checkoutAccess = await hasPermission('checkout', 'read')
  if (!checkoutAccess) {
    return (
      <div className="flex h-full items-center justify-center p-12">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">Checkout access required to view this report.</div>
      </div>
    )
  }
  const { preset, period, mode, customFrom, customTo } = resolvePeriod(searchParams)
  const data = await getExtrasOverview(period)

  return (
    <ReportShell title="Extras revenue" subtitle="F&amp;B and ancillary spend per guest" period={period} preset={preset} customFrom={customFrom} customTo={customTo} mode={mode}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <KpiCard label="Total extras" value={formatBDTCompact(data.total_extras_revenue)} mode="off" />
        <KpiCard label="Finalized checkouts" value={String(data.finalized_checkouts)} mode="off" />
        <KpiCard label="Avg per guest" value={formatBDTCompact(data.avg_extras_per_guest)} note="Total charges / total guests across finalized checkouts" mode="off" />
        <KpiCard label="F&B subset" value={formatBDTCompact(data.fb_revenue)} mode="off" />
      </div>
      <ChartCard title="Daily extras">
        <ExtrasTrendChart data={data.daily} />
      </ChartCard>
      <ChartCard title="By category">
        <CategoryPieChart data={data.by_category} />
      </ChartCard>
      <SimpleTable<{ category: string; total: number; pct: number }>
        rows={data.by_category}
        columns={[
          { key: 'category', label: 'Category' },
          { key: 'total',    label: 'Revenue', align: 'right', render: (r) => formatBDT(r.total) },
          { key: 'pct',      label: '% of total', align: 'right', render: (r) => `${r.pct.toFixed(1)}%` },
        ]}
      />
    </ReportShell>
  )
}
