import Link from 'next/link'
import { requirePermission } from '@/lib/auth/permissions'
import { resolvePeriod } from '@/lib/reports/page-params'
import { getCashDrawer } from '@/lib/queries/reports/coffee-shop'
import { ReportShell } from '@/components/reports/ReportShell'
import { KpiCard } from '@/components/reports/KpiCard'
import { SimpleTable } from '@/components/reports/SimpleTable'
import { formatBDT } from '@/lib/formatters/currency'
import { formatBDTCompact } from '@/lib/reports/format'
import type { CashDrawerRow } from '@/lib/queries/reports/coffee-shop'

export const dynamic = 'force-dynamic'

interface PageProps { searchParams: { period?: string; from?: string; to?: string; compare?: string } }

export default async function CoffeeShopCashPage({ searchParams }: PageProps) {
  await requirePermission('reports', 'read')
  // Defaults to today instead of this_month for cash reconciliation
  const sp = { ...searchParams, period: searchParams.period ?? 'today' }
  const { preset, period, mode, customFrom, customTo } = resolvePeriod(sp)
  const data = await getCashDrawer(period)

  return (
    <ReportShell
      exportReportId="coffee-shop"
      title="Cash drawer reconciliation"
      subtitle="End-of-day expected cash"
      period={period}
      preset={preset}
      customFrom={customFrom}
      customTo={customTo}
      mode={mode}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KpiCard label="Cash sales count" value={String(data.cash_sales_count)} mode="off" />
        <KpiCard label="Total cash collected" value={formatBDTCompact(data.total_cash)} emphasis="positive" mode="off" />
        <KpiCard label="Total digital collected" value={formatBDTCompact(data.total_digital)} mode="off" />
      </div>

      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
        <span className="font-semibold">Expected cash drawer = </span>
        <span className="font-mono font-bold tabular-nums text-base">{formatBDT(data.total_cash)}</span>
        <span className="ml-2 text-xs">— what should be physically in the till at end-of-period.</span>
      </div>

      <SimpleTable<CashDrawerRow>
        rows={data.rows}
        emptyMessage="No cash sales in this period."
        columns={[
          { key: 'sale_number',    label: 'Sale #' },
          { key: 'net_amount',     label: 'Net',  align: 'right', render: (r) => formatBDT(r.net_amount) },
          { key: 'cash_component', label: 'Cash component', align: 'right', render: (r) => <span className="font-semibold text-emerald-700">{formatBDT(r.cash_component)}</span> },
        ]}
      />

      <div className="text-xs text-gray-500">
        <Link href="/reports/coffee-shop?period=today" className="hover:underline text-stone-700 font-medium">← Back to Coffee Shop overview</Link>
      </div>
    </ReportShell>
  )
}
