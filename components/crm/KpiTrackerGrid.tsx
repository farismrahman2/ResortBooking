import type { KpiTracker } from '@/lib/queries/crm'
import { KPI_METRIC_LABELS, KPI_MONEY_METRICS, type KpiStatus } from '@/lib/crm/kpi-metrics'
import { formatBDT } from '@/lib/formatters/currency'

const STATUS_STYLE: Record<KpiStatus, string> = {
  green: 'bg-emerald-50 text-emerald-700',
  amber: 'bg-amber-50 text-amber-700',
  red:   'bg-red-50 text-red-700',
  na:    'bg-gray-50 text-gray-400',
}
const STATUS_MARK: Record<KpiStatus, string> = { green: '✓', amber: '⚠', red: '✗', na: '—' }

function fmt(metric: string, n: number): string {
  return KPI_MONEY_METRICS.has(metric as never) ? formatBDT(n) : String(n)
}

export function KpiTrackerGrid({ tracker }: { tracker: KpiTracker }) {
  const cols: Array<{ key: 'day30' | 'day60' | 'day90'; label: string; day: number; total: number }> = [
    { key: 'day30', label: 'Day 30', day: tracker.periods.day30.dayInPeriod, total: 30 },
    { key: 'day60', label: 'Day 60', day: tracker.periods.day60.dayInPeriod, total: 60 },
    { key: 'day90', label: 'Day 90', day: tracker.periods.day90.dayInPeriod, total: 90 },
  ]

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="min-w-full text-sm">
        <thead className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
          <tr>
            <th className="px-4 py-2.5 font-medium">Metric</th>
            {cols.map((c) => <th key={c.key} className="px-4 py-2.5 text-center font-medium">{c.label}<span className="ml-1 text-[10px] normal-case text-gray-400">(day {c.day})</span></th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {tracker.rows.map((row) => (
            <tr key={row.metric}>
              <td className="px-4 py-2.5 font-medium text-gray-800">{KPI_METRIC_LABELS[row.metric]}</td>
              {cols.map((c) => {
                const cell = row[c.key]
                return (
                  <td key={c.key} className="px-4 py-2.5 text-center">
                    <div className={`mx-auto inline-flex items-center gap-1.5 rounded-md px-2 py-1 ${STATUS_STYLE[cell.status]}`}>
                      <span>{STATUS_MARK[cell.status]}</span>
                      <span className="tabular-nums font-medium">{fmt(row.metric, cell.actual)}</span>
                      <span className="text-[11px] opacity-70">/ {fmt(row.metric, cell.target)}</span>
                    </div>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
