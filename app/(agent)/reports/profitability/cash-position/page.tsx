import { requirePermission } from '@/lib/auth/permissions'
import { resolvePeriod } from '@/lib/reports/page-params'
import { getCashPosition } from '@/lib/queries/reports/profitability'
import { ReportShell } from '@/components/reports/ReportShell'
import { KpiCard } from '@/components/reports/KpiCard'
import { ChartCard } from '@/components/reports/ChartCard'
import { CashPositionChart } from '@/components/reports/profitability/CashPositionChart'
import { formatBDTCompact } from '@/lib/reports/format'
import { Info } from 'lucide-react'

export const dynamic = 'force-dynamic'

interface PageProps { searchParams: { period?: string; from?: string; to?: string; compare?: string } }

export default async function CashPositionPage({ searchParams }: PageProps) {
  await requirePermission('reports', 'read')
  const { preset, period, mode, customFrom, customTo } = resolvePeriod(searchParams)
  const points = await getCashPosition(period)
  const last = points[points.length - 1]

  return (
    <ReportShell exportReportId="cash-position" title="Cash position" subtitle="Running balance over time" period={period} preset={preset} customFrom={customFrom} customTo={customTo} mode={mode}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KpiCard label="Current balance"     value={last ? formatBDTCompact(last.balance) : '—'} mode="off" emphasis={last && last.balance >= 0 ? 'positive' : 'negative'} />
        <KpiCard label="Cumulative income"   value={last ? formatBDTCompact(last.cumulative_income) : '—'} mode="off" />
        <KpiCard label="Cumulative expenses" value={last ? formatBDTCompact(last.cumulative_expenses) : '—'} mode="off" />
      </div>
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 inline-flex items-start gap-2">
        <Info size={14} className="mt-0.5 shrink-0" />
        <span>Book cash position — income is recognised when booked, expenses when entered. This is not a bank-account balance.</span>
      </div>
      <ChartCard title="Cumulative balance">
        <CashPositionChart data={points} />
      </ChartCard>
    </ReportShell>
  )
}
