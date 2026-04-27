import Link from 'next/link'
import { Topbar } from '@/components/layout/Topbar'
import { MigrationErrorBanner } from '@/components/hr/MigrationErrorBanner'
import { PayrollControlBar } from './PayrollClient'
import { PayrollPreviewTable } from '@/components/hr/PayrollPreviewTable'
import { previewPayrollRun } from '@/lib/actions/payroll'
import { getPayrollRuns } from '@/lib/queries/payroll'
import { formatBDT } from '@/lib/formatters/currency'
import { formatPeriod, PAYROLL_STATUS_BADGE, PAYROLL_STATUS_LABELS } from '@/components/hr/labels'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: { period?: string }
}

function defaultPeriod(): string {
  // Default to the previous month — that's the typical "I'm running payroll now" case.
  const d = new Date()
  d.setMonth(d.getMonth() - 1, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

export default async function PayrollPage({ searchParams }: PageProps) {
  const periodIso = searchParams.period && /^\d{4}-\d{2}-01$/.test(searchParams.period)
    ? searchParams.period
    : defaultPeriod()

  let migrationError: string | null = null
  let preview: Awaited<ReturnType<typeof previewPayrollRun>> | null = null
  let runs: Awaited<ReturnType<typeof getPayrollRuns>> = []
  try {
    [preview, runs] = await Promise.all([previewPayrollRun(periodIso), getPayrollRuns()])
  } catch (err) {
    migrationError = err instanceof Error ? err.message : String(err)
  }

  // Determine "can finalize" — earliest is the 1st of the next month
  const periodDate = new Date(periodIso + 'T00:00:00')
  const earliest = new Date(periodDate.getFullYear(), periodDate.getMonth() + 1, 1)
  const earliestIso = earliest.toISOString().slice(0, 10)
  const canFinalize = new Date() >= earliest

  if (preview && !preview.success) {
    return (
      <div className="flex h-full flex-col">
        <Topbar title="Payroll" />
        <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
          <MigrationErrorBanner error={preview.error} />
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <Topbar title="Payroll" subtitle={formatPeriod(periodIso)} />
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 space-y-5">
        {migrationError && <MigrationErrorBanner error={migrationError} />}

        {preview?.success && (
          <>
            <PayrollControlBar
              periodIso={periodIso}
              status={preview.data.status}
              finalizedAt={preview.data.finalized_at}
              canFinalize={canFinalize}
              earliestDate={earliestIso}
              hasLines={preview.data.lines.length > 0}
            />

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <SummaryCard label="Lines" value={String(preview.data.lines.length)} accent="sky" />
              <SummaryCard label="Total Gross" value={formatBDT(preview.data.total_gross)} accent="gray" />
              <SummaryCard label="Total Net" value={formatBDT(preview.data.total_net)} accent="emerald" />
            </div>

            <PayrollPreviewTable
              lines={preview.data.lines}
              totalGross={preview.data.total_gross}
              totalNet={preview.data.total_net}
            />
          </>
        )}

        {/* Finalized run history */}
        {runs.length > 0 && (
          <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
            <div className="border-b border-gray-200 bg-gray-50 px-4 py-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-600">Run History</h3>
            </div>
            <ul className="divide-y divide-gray-100">
              {runs.map((r) => (
                <li key={r.id}>
                  <Link
                    href={`/hr/payroll?period=${r.period}`}
                    className="flex items-center justify-between px-4 py-2 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium text-gray-900">{formatPeriod(r.period)}</span>
                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${PAYROLL_STATUS_BADGE[r.status]}`}>
                        {PAYROLL_STATUS_LABELS[r.status]}
                      </span>
                    </div>
                    <div className="text-sm font-mono tabular-nums text-gray-700">
                      <span className="text-gray-500 mr-2">Net:</span>
                      <span className="font-semibold">{formatBDT(r.total_net)}</span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}

function SummaryCard({
  label, value, accent,
}: { label: string; value: string; accent: 'sky' | 'emerald' | 'gray' }) {
  const map = {
    sky:     'bg-sky-50 border-sky-200 text-sky-900',
    emerald: 'bg-emerald-50 border-emerald-200 text-emerald-900',
    gray:    'bg-gray-50 border-gray-200 text-gray-900',
  } as const
  return (
    <div className={`rounded-xl border p-3 ${map[accent]}`}>
      <p className="text-[10px] uppercase tracking-wider font-semibold opacity-70">{label}</p>
      <p className="mt-0.5 text-lg font-bold tabular-nums font-mono">{value}</p>
    </div>
  )
}
