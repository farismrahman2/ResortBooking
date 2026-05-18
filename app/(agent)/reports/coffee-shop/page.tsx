import { requirePermission } from '@/lib/auth/permissions'
import { resolvePeriod } from '@/lib/reports/page-params'
import { getCoffeeShopOverview } from '@/lib/queries/reports/coffee-shop'
import { ReportShell } from '@/components/reports/ReportShell'
import { KpiCard } from '@/components/reports/KpiCard'
import { ChartCard } from '@/components/reports/ChartCard'
import { SimpleTable } from '@/components/reports/SimpleTable'
import { CoffeeShopTrendChart } from '@/components/reports/coffee-shop/CoffeeShopTrendChart'
import { PaymentMixChart } from '@/components/reports/coffee-shop/PaymentMixChart'
import { CategorySplitChart } from '@/components/reports/coffee-shop/CategorySplitChart'
import { formatBDTCompact } from '@/lib/reports/format'
import { formatBDT } from '@/lib/formatters/currency'

export const dynamic = 'force-dynamic'

interface PageProps { searchParams: { period?: string; from?: string; to?: string; compare?: string } }

export default async function CoffeeShopReportPage({ searchParams }: PageProps) {
  await requirePermission('reports', 'read')
  const { preset, period, mode, customFrom, customTo } = resolvePeriod(searchParams)
  const data = await getCoffeeShopOverview(period)

  return (
    <ReportShell
      exportReportId="coffee-shop"
      title="Coffee Shop"
      subtitle="Standalone walk-in sales — separate from room extras"
      period={period}
      preset={preset}
      customFrom={customFrom}
      customTo={customTo}
      mode={mode}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Sales count"   value={String(data.sales_count)} mode="off" />
        <KpiCard label="Net revenue"   value={formatBDTCompact(data.net_revenue)} mode="off" />
        <KpiCard label="Avg sale"      value={formatBDTCompact(data.avg_sale)} mode="off" />
        <KpiCard label="Top item"      value={data.top_item_summary ? data.top_item_summary.name : '—'}
          note={data.top_item_summary ? `${data.top_item_summary.units_sold} units sold` : undefined} mode="off" />
      </div>

      <ChartCard title="Daily revenue">
        <CoffeeShopTrendChart data={data.daily} />
      </ChartCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Payment mix">
          <PaymentMixChart data={data.payment_mix} />
        </ChartCard>
        <ChartCard title="Category split">
          <CategorySplitChart data={data.category_split} />
        </ChartCard>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-gray-900">Top items</h3>
        <SimpleTable<{ name: string; category: string; units_sold: number; revenue: number; pct: number }>
          rows={data.top_items}
          columns={[
            { key: 'name',       label: 'Item' },
            { key: 'category',   label: 'Category' },
            { key: 'units_sold', label: 'Units sold', align: 'right' },
            { key: 'revenue',    label: 'Revenue',    align: 'right', render: (r) => formatBDT(r.revenue) },
            { key: 'pct',        label: '% of total', align: 'right', render: (r) => `${r.pct.toFixed(1)}%` },
          ]}
        />
        <p className="mt-1 text-[10px] text-gray-400">
          Comp items count toward units sold but not revenue.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Total discount</p>
          <p className="mt-1 text-xl font-bold tabular-nums text-amber-700">{formatBDT(data.total_discount)}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Comp value</p>
          <p className="mt-1 text-xl font-bold tabular-nums text-amber-700">{formatBDT(data.comp_value)}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Voided sales</p>
          <p className="mt-1 text-xl font-bold tabular-nums text-rose-700">
            {data.voided_count} <span className="text-xs font-normal text-gray-500">({formatBDT(data.voided_value)})</span>
          </p>
        </div>
      </div>
    </ReportShell>
  )
}
