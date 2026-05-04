import { format } from 'date-fns'
import { requirePermission, hasPermission } from '@/lib/auth/permissions'
import { resolvePeriod } from '@/lib/reports/page-params'
import { getLoanExposure, type LoanExposureRow, type LoanAgingRow } from '@/lib/queries/reports/hr'
import { ReportShell } from '@/components/reports/ReportShell'
import { KpiCard } from '@/components/reports/KpiCard'
import { SimpleTable } from '@/components/reports/SimpleTable'
import { formatBDT } from '@/lib/formatters/currency'
import { formatBDTCompact } from '@/lib/reports/format'

export const dynamic = 'force-dynamic'

interface PageProps { searchParams: { period?: string; from?: string; to?: string; compare?: string } }

export default async function LoanExposurePage({ searchParams }: PageProps) {
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
  const { totals, active, aging } = await getLoanExposure()

  return (
    <ReportShell exportReportId="hr-loan-exposure" title="Loan exposure" subtitle="Outstanding staff loans + aging buckets" period={period} preset={preset} customFrom={customFrom} customTo={customTo} mode={mode}>
      <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-3 text-xs text-indigo-900">
        Loan exposure is the total outstanding amount that staff owe the business. Compare against the most recent finalized monthly payroll to assess concentration risk.
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KpiCard label="Total outstanding"  value={formatBDTCompact(totals.total_outstanding)} mode="off" invertColour />
        <KpiCard label="Active loans"       value={String(totals.active_loans)} mode="off" />
        <KpiCard label="% of monthly payroll" value={totals.pct_of_payroll === null ? '—' : `${totals.pct_of_payroll.toFixed(1)}%`} mode="off" invertColour />
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-gray-900">Active loans</h3>
        <SimpleTable<LoanExposureRow>
          rows={active}
          emptyMessage="No active loans on the books."
          columns={[
            { key: 'employee_name',       label: 'Employee' },
            { key: 'employee_code',       label: 'Code' },
            { key: 'principal',           label: 'Principal',     align: 'right', render: (r) => formatBDT(r.principal) },
            { key: 'monthly_installment', label: 'Monthly EMI',   align: 'right', render: (r) => formatBDT(r.monthly_installment) },
            { key: 'repaid',              label: 'Repaid',        align: 'right', render: (r) => formatBDT(r.repaid) },
            { key: 'outstanding',         label: 'Outstanding',   align: 'right', render: (r) => <span className="font-semibold">{formatBDT(r.outstanding)}</span> },
            { key: 'months_remaining',    label: 'Months left',   align: 'right' },
            { key: 'taken_on',            label: 'Taken on',      render: (r) => format(new Date(r.taken_on + 'T00:00:00'), 'd MMM yyyy') },
          ]}
        />
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-gray-900">Aging analysis</h3>
        <SimpleTable<LoanAgingRow>
          rows={aging}
          columns={[
            { key: 'bucket',            label: 'Age' },
            { key: 'count',             label: 'Loans', align: 'right' },
            { key: 'total_outstanding', label: 'Outstanding', align: 'right', render: (r) => formatBDT(r.total_outstanding) },
          ]}
        />
      </div>
    </ReportShell>
  )
}
