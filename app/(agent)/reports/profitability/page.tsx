import { format } from 'date-fns'
import { requirePermission } from '@/lib/auth/permissions'
import { resolvePeriod } from '@/lib/reports/page-params'
import { getMonthlyPnL, type MonthlyPnLRow } from '@/lib/queries/reports/profitability'
import { ReportShell } from '@/components/reports/ReportShell'
import { KpiCard } from '@/components/reports/KpiCard'
import { ChartCard } from '@/components/reports/ChartCard'
import { SimpleTable } from '@/components/reports/SimpleTable'
import { ProfitChart } from '@/components/reports/profitability/ProfitChart'
import { formatBDTCompact } from '@/lib/reports/format'
import { formatBDT } from '@/lib/formatters/currency'

export const dynamic = 'force-dynamic'

interface PageProps { searchParams: { period?: string; from?: string; to?: string; compare?: string } }

export default async function ProfitabilityPage({ searchParams }: PageProps) {
  await requirePermission('reports', 'read')
  const { preset, period, mode, customFrom, customTo } = resolvePeriod(searchParams)
  const rows = await getMonthlyPnL(period)
  const totals = rows.reduce((a, r) => ({
    income: a.income + r.income, expenses: a.expenses + r.expenses, net: a.net + r.net,
  }), { income: 0, expenses: 0, net: 0 })
  const margin = totals.income > 0 ? Math.round((totals.net / totals.income) * 1000) / 10 : null

  return (
    <ReportShell title="Profitability" subtitle="Top-line P&amp;L by month" period={period} preset={preset} customFrom={customFrom} customTo={customTo} mode={mode}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <KpiCard label="Total income"   value={formatBDTCompact(totals.income)} mode="off" />
        <KpiCard label="Total expenses" value={formatBDTCompact(totals.expenses)} mode="off" />
        <KpiCard label="Net" value={formatBDTCompact(totals.net)} emphasis={totals.net >= 0 ? 'positive' : 'negative'} mode="off" />
        <KpiCard label="Net margin" value={margin === null ? '—' : `${margin.toFixed(1)}%`} mode="off" />
      </div>
      <ChartCard title="Income / expenses / net (monthly)">
        <ProfitChart data={rows} />
      </ChartCard>
      <SimpleTable<MonthlyPnLRow>
        rows={rows}
        columns={[
          { key: 'month',      label: 'Month', render: (r) => format(new Date(r.month + 'T00:00:00'), 'MMM yyyy') },
          { key: 'income',     label: 'Income',   align: 'right', render: (r) => formatBDT(r.income) },
          { key: 'expenses',   label: 'Expenses', align: 'right', render: (r) => formatBDT(r.expenses) },
          { key: 'net',        label: 'Net',      align: 'right', render: (r) => (
            <span className={r.net < 0 ? 'text-rose-700 font-semibold' : 'text-emerald-700 font-semibold'}>{formatBDT(r.net)}</span>
          ) },
          { key: 'margin_pct', label: 'Margin',   align: 'right', render: (r) => r.margin_pct === null ? '—' : `${r.margin_pct.toFixed(1)}%` },
        ]}
        totals={{
          month: 'Total',
          income:   formatBDT(totals.income),
          expenses: formatBDT(totals.expenses),
          net:      formatBDT(totals.net),
          margin_pct: margin === null ? '—' : `${margin.toFixed(1)}%`,
        }}
      />
    </ReportShell>
  )
}
