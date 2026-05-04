import { requirePermission, hasPermission } from '@/lib/auth/permissions'
import { resolvePeriod } from '@/lib/reports/page-params'
import { getTopChargeItems, type TopItemRow } from '@/lib/queries/reports/checkout'
import { ReportShell } from '@/components/reports/ReportShell'
import { ChartCard } from '@/components/reports/ChartCard'
import { SimpleTable } from '@/components/reports/SimpleTable'
import { TopItemsBarChart } from '@/components/reports/checkout/TopItemsBarChart'
import { formatBDT } from '@/lib/formatters/currency'

export const dynamic = 'force-dynamic'

interface PageProps { searchParams: { period?: string; from?: string; to?: string; compare?: string } }

export default async function TopItemsPage({ searchParams }: PageProps) {
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
  const rows = await getTopChargeItems(period, 50)
  const top10 = rows.filter((r) => !r.is_freeform).slice(0, 10)

  return (
    <ReportShell title="Top-selling items" subtitle="Most-popular charge items by revenue" period={period} preset={preset} customFrom={customFrom} customTo={customTo} mode={mode}>
      <ChartCard title="Top 10 by revenue">
        <TopItemsBarChart data={top10} />
      </ChartCard>
      <SimpleTable<TopItemRow>
        rows={rows}
        columns={[
          { key: 'item_name',     label: 'Item' },
          { key: 'category',      label: 'Category' },
          { key: 'times_sold',    label: 'Times sold', align: 'right' },
          { key: 'total_qty',     label: 'Qty',        align: 'right' },
          { key: 'avg_price',     label: 'Avg price',  align: 'right', render: (r) => formatBDT(r.avg_price) },
          { key: 'total_revenue', label: 'Revenue',    align: 'right', render: (r) => formatBDT(r.total_revenue) },
        ]}
      />
    </ReportShell>
  )
}
