import Link from 'next/link'
import { requirePermission } from '@/lib/auth/permissions'
import { resolvePeriod } from '@/lib/reports/page-params'
import { getBudgetVsActual, type BudgetVarianceRow } from '@/lib/queries/reports/expenses'
import { ReportShell } from '@/components/reports/ReportShell'
import { SimpleTable } from '@/components/reports/SimpleTable'
import { formatBDT } from '@/lib/formatters/currency'

export const dynamic = 'force-dynamic'

interface PageProps { searchParams: { period?: string; from?: string; to?: string; compare?: string } }

const STATUS_BADGE: Record<BudgetVarianceRow['status'], string> = {
  under:     'bg-emerald-100 text-emerald-800 border-emerald-200',
  on_track:  'bg-gray-100 text-gray-700 border-gray-200',
  warn:      'bg-amber-100 text-amber-800 border-amber-200',
  over:      'bg-rose-100 text-rose-800 border-rose-200',
}

export default async function BudgetVsActualPage({ searchParams }: PageProps) {
  await requirePermission('reports', 'read')
  const { preset, period, mode, customFrom, customTo } = resolvePeriod(searchParams)
  const rows = await getBudgetVsActual(period)

  return (
    <ReportShell title="Budget vs actual" subtitle="Variance by category" period={period} preset={preset} customFrom={customFrom} customTo={customTo} mode={mode}>
      {rows.length === 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          No budgets configured for this period. Add monthly budgets in <Link href="/expenses/budgets" className="underline font-semibold">Expenses → Budgets</Link>.
        </div>
      ) : (
        <SimpleTable<BudgetVarianceRow>
          rows={rows}
          columns={[
            { key: 'category_name',  label: 'Category' },
            { key: 'budgeted',       label: 'Budgeted', align: 'right', render: (r) => formatBDT(r.budgeted) },
            { key: 'actual',         label: 'Actual',   align: 'right', render: (r) => formatBDT(r.actual) },
            { key: 'variance',       label: 'Variance', align: 'right', render: (r) => (
              <span className={r.variance < 0 ? 'text-emerald-700' : r.variance_pct !== null && r.variance_pct > 10 ? 'text-rose-700' : 'text-gray-700'}>
                {r.variance >= 0 ? '+' : ''}{formatBDT(r.variance)}
              </span>
            ) },
            { key: 'variance_pct',   label: '% var',    align: 'right', render: (r) => r.variance_pct === null ? '—' : `${r.variance_pct >= 0 ? '+' : ''}${r.variance_pct.toFixed(1)}%` },
            { key: 'status',         label: 'Status', render: (r) => (
              <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${STATUS_BADGE[r.status]}`}>
                {r.status === 'on_track' ? 'On track' : r.status === 'warn' ? 'Warning' : r.status === 'over' ? 'Over budget' : 'Under'}
              </span>
            ) },
          ]}
        />
      )}
    </ReportShell>
  )
}
