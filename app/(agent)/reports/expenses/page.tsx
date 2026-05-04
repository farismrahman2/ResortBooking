import { requirePermission } from '@/lib/auth/permissions'
import { resolvePeriod } from '@/lib/reports/page-params'
import { computeAvailability } from '@/lib/reports/sufficient-data'
import { getDailyExpenses, getCategoryBreakdownReports, getTopVendors,
  type CategoryGroupRow, type VendorRow } from '@/lib/queries/reports/expenses'
import { getHubTotals, getHubTotalsForComparison } from '@/lib/queries/reports/hub'
import { ReportShell } from '@/components/reports/ReportShell'
import { KpiCard } from '@/components/reports/KpiCard'
import { ChartCard } from '@/components/reports/ChartCard'
import { SimpleTable } from '@/components/reports/SimpleTable'
import { ExpenseTrendChart } from '@/components/reports/expenses/ExpenseTrendChart'
import { CategoryGroupChart } from '@/components/reports/expenses/CategoryGroupChart'
import { formatBDTCompact } from '@/lib/reports/format'
import { formatBDT } from '@/lib/formatters/currency'
import type { ComparisonMode } from '@/lib/reports/types'

export const dynamic = 'force-dynamic'

interface PageProps { searchParams: { period?: string; from?: string; to?: string; compare?: string } }

export default async function ExpensesReportPage({ searchParams }: PageProps) {
  await requirePermission('reports', 'read')
  const { preset, period, mode, customFrom, customTo } = resolvePeriod(searchParams)

  const [current, prev, yoy, daily, breakdown, vendors, avail] = await Promise.all([
    getHubTotals(period),
    mode === 'previous_period' || mode === 'both' ? getHubTotalsForComparison(period, 'previous_period') : Promise.resolve(null),
    mode === 'year_over_year'  || mode === 'both' ? getHubTotalsForComparison(period, 'year_over_year')  : Promise.resolve(null),
    getDailyExpenses(period),
    getCategoryBreakdownReports(period),
    getTopVendors(period),
    computeAvailability(period),
  ])

  const showPrev = (mode === 'previous_period' || mode === 'both') && avail.prev.available
  const showYoy  = (mode === 'year_over_year'  || mode === 'both') && avail.yoy.available
  const effectiveMode: ComparisonMode = showPrev && showYoy ? 'both' : showPrev ? 'previous_period' : showYoy ? 'year_over_year' : 'off'

  const txCount = daily.reduce((s, d) => s + d.count, 0)
  const avgTx = txCount > 0 ? Math.round(current.total_expenses / txCount) : 0

  return (
    <ReportShell title="Expense overview" subtitle="Spend trends and category split" period={period} preset={preset} customFrom={customFrom} customTo={customTo} mode={mode}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KpiCard label="Total expenses" value={formatBDTCompact(current.total_expenses)} raw={current.total_expenses} prior={prev?.total_expenses ?? null} yoy={yoy?.total_expenses ?? null} mode={effectiveMode} invertColour />
        <KpiCard label="Transactions"   value={String(txCount)} mode="off" />
        <KpiCard label="Avg transaction" value={formatBDTCompact(avgTx)} mode="off" />
      </div>
      <ChartCard title="Daily expenses">
        <ExpenseTrendChart data={daily} />
      </ChartCard>
      <ChartCard title="By category group">
        <CategoryGroupChart data={breakdown.groups} />
      </ChartCard>
      <div>
        <h3 className="mb-2 text-sm font-semibold text-gray-900">Top vendors</h3>
        <SimpleTable<VendorRow>
          rows={vendors}
          columns={[
            { key: 'payee_name',   label: 'Payee' },
            { key: 'payee_type',   label: 'Type' },
            { key: 'transactions', label: 'Tx',     align: 'right' },
            { key: 'total',        label: 'Spend',  align: 'right', render: (r) => formatBDT(r.total) },
          ]}
        />
      </div>
    </ReportShell>
  )
}
