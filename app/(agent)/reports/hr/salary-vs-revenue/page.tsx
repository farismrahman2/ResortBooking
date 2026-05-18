import { format } from 'date-fns'
import { requirePermission, hasPermission } from '@/lib/auth/permissions'
import { resolvePeriod } from '@/lib/reports/page-params'
import { getSalaryVsRevenue, type SalaryVsRevenueRow } from '@/lib/queries/reports/hr'
import { ReportShell } from '@/components/reports/ReportShell'
import { KpiCard } from '@/components/reports/KpiCard'
import { ChartCard } from '@/components/reports/ChartCard'
import { SimpleTable } from '@/components/reports/SimpleTable'
import { SalaryVsRevenueChart } from '@/components/reports/hr/SalaryVsRevenueChart'
import { formatBDT } from '@/lib/formatters/currency'

export const dynamic = 'force-dynamic'

interface PageProps { searchParams: { period?: string; from?: string; to?: string; compare?: string } }

const STATUS_BADGE = {
  pending: 'bg-gray-100 text-gray-600 border-gray-200',
  healthy: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  watch:   'bg-amber-100 text-amber-800 border-amber-200',
  high:    'bg-rose-100 text-rose-800 border-rose-200',
} as const

const STATUS_LABEL = {
  pending: 'Pending', healthy: 'Healthy', watch: 'Watch', high: 'High',
} as const

export default async function SalaryVsRevenuePage({ searchParams }: PageProps) {
  await requirePermission('reports', 'read')
  const hrAccess = await hasPermission('hr', 'read')
  if (!hrAccess) {
    return (
      <div className="flex h-full items-center justify-center p-12">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">HR access required to view this report.</div>
      </div>
    )
  }
  const { preset, period, mode, customFrom, customTo } = resolvePeriod(searchParams)
  const rows = await getSalaryVsRevenue(period)

  // Current period: weighted average from rows where payroll is finalized
  const totals = rows.reduce(
    (a, r) => ({
      revenue: a.revenue + r.revenue,
      payroll: a.payroll + (r.payroll_total ?? 0),
      monthsCounted: a.monthsCounted + (r.payroll_total !== null ? 1 : 0),
    }),
    { revenue: 0, payroll: 0, monthsCounted: 0 },
  )
  const currentPct = totals.revenue > 0 && totals.monthsCounted > 0
    ? Math.round((totals.payroll / totals.revenue) * 1000) / 10
    : null

  return (
    <ReportShell exportReportId="hr-salary-vs-revenue" title="Salary % of revenue" subtitle="Payroll cost relative to income" period={period} preset={preset} customFrom={customFrom} customTo={customTo} mode={mode}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KpiCard label="Salary % of revenue" value={currentPct === null ? '—' : `${currentPct.toFixed(1)}%`}
          mode="off" emphasis={currentPct === null ? 'default' : currentPct > 35 ? 'negative' : currentPct >= 30 ? 'default' : 'positive'} />
        <KpiCard label="Total payroll (finalized)" value={formatBDT(totals.payroll)} mode="off" />
        <KpiCard label="Total revenue" value={formatBDT(totals.revenue)} mode="off" />
      </div>
      <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-3 text-xs text-indigo-900">
        Industry benchmark for hospitality payroll is roughly <strong>25–35% of revenue</strong>. Above 35% suggests over-staffing or under-pricing.
      </div>
      <ChartCard title="Trend with 25% / 35% reference lines">
        <SalaryVsRevenueChart data={rows} />
      </ChartCard>
      <SimpleTable<SalaryVsRevenueRow>
        rows={rows}
        columns={[
          { key: 'month',         label: 'Month', render: (r) => format(new Date(r.month + 'T00:00:00'), 'MMM yyyy') },
          { key: 'revenue',       label: 'Revenue', align: 'right', render: (r) => formatBDT(r.revenue) },
          { key: 'payroll_total', label: 'Payroll', align: 'right', render: (r) => r.payroll_total === null ? <span className="text-gray-400">Pending</span> : formatBDT(r.payroll_total) },
          { key: 'salary_pct',    label: '%', align: 'right', render: (r) => r.salary_pct === null ? '—' : `${r.salary_pct.toFixed(1)}%` },
          { key: 'status',        label: 'Status', render: (r) => (
            <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${STATUS_BADGE[r.status]}`}>
              {STATUS_LABEL[r.status]}
            </span>
          ) },
        ]}
      />
    </ReportShell>
  )
}
