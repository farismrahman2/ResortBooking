import { FileDown } from 'lucide-react'
import { requirePermission } from '@/lib/auth/permissions'
import { resolvePeriod } from '@/lib/reports/page-params'
import { toIsoDate } from '@/lib/reports/periods'
import { getAdvancePaymentsReport } from '@/lib/queries/reports/advance-payments'
import { ReportShell } from '@/components/reports/ReportShell'
import { KpiCard } from '@/components/reports/KpiCard'
import { AdvancePaymentDays } from '@/components/reports/AdvancePaymentDays'
import { formatBDT } from '@/lib/formatters/currency'
import { formatDate } from '@/lib/formatters/dates'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: { period?: string; from?: string; to?: string; compare?: string }
}

/**
 * Advance money received, day by day — the sheet that reconciles against the
 * bKash and bank statements for a date range.
 */
export default async function AdvancePaymentsReport({ searchParams }: PageProps) {
  await requirePermission('reports', 'read')
  const { preset, period, mode, customFrom, customTo } = resolvePeriod(searchParams)
  const fromIso = toIsoDate(period.from)
  const toIso   = toIsoDate(period.to)

  const data = await getAdvancePaymentsReport(fromIso, toIso)
  const busiest = data.days.reduce<typeof data.days[number] | null>(
    (best, d) => (d.total > (best?.total ?? 0) ? d : best), null)
  const top = data.byMethod.reduce<typeof data.byMethod[number] | null>(
    (best, m) => (m.amount > (best?.amount ?? 0) ? m : best), null)

  return (
    <ReportShell
      title="Advance payments"
      subtitle="Advances received in the period, by the day the money arrived"
      period={period} preset={preset} customFrom={customFrom} customTo={customTo} mode={mode}
      toolbar={
        <a href={`/reports/print?sections=advance&from=${fromIso}&to=${toIso}`}
          className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-forest-700 px-3 text-xs font-semibold text-white">
          <FileDown size={14} /> PDF
        </a>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KpiCard label="Advance received" value={formatBDT(data.total)} mode="off"
          note={`${data.count} payment${data.count === 1 ? '' : 's'} across ${data.days.length} day${data.days.length === 1 ? '' : 's'}`} />
        <KpiCard label={top ? `Most via ${top.label}` : 'By method'} mode="off"
          value={top ? formatBDT(top.amount) : '—'}
          note={data.byMethod.map((m) => `${m.label} ${formatBDT(m.amount)}`).join(' · ') || undefined} />
        <KpiCard label="Busiest day" mode="off"
          value={busiest ? formatBDT(busiest.total) : '—'}
          note={busiest ? `${formatDate(busiest.date)} · ${busiest.rows.length} payment${busiest.rows.length === 1 ? '' : 's'}` : undefined} />
      </div>

      {data.voidTotal > 0 && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {formatBDT(data.voidTotal)} of this was taken against bookings later cancelled or marked
          no-show. It is still money received; the rows are marked in the list below.
        </p>
      )}

      <AdvancePaymentDays days={data.days} />

      {data.days.length > 1 && (
        <div>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Day by day
          </h2>
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="w-full text-sm">
              <thead className="border-b border-gray-200 bg-gray-50 text-left text-[11px] uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2 text-right">Entries</th>
                  {data.byMethod.map((m) => (
                    <th key={m.method} className="px-3 py-2 text-right">{m.label}</th>
                  ))}
                  <th className="px-3 py-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {data.days.map((d) => (
                  <tr key={d.date} className="border-b border-gray-100 last:border-0">
                    <td className="whitespace-nowrap px-3 py-2">{formatDate(d.date)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{d.rows.length}</td>
                    {data.byMethod.map((m) => (
                      <td key={m.method} className="px-3 py-2 text-right tabular-nums">
                        {formatBDT(d.byMethod.find((x) => x.method === m.method)?.amount ?? 0)}
                      </td>
                    ))}
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">{formatBDT(d.total)}</td>
                  </tr>
                ))}
                <tr className="bg-gray-50 font-semibold">
                  <td className="px-3 py-2">Total</td>
                  <td className="px-3 py-2 text-right tabular-nums">{data.count}</td>
                  {data.byMethod.map((m) => (
                    <td key={m.method} className="px-3 py-2 text-right tabular-nums">{formatBDT(m.amount)}</td>
                  ))}
                  <td className="px-3 py-2 text-right tabular-nums">{formatBDT(data.total)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </ReportShell>
  )
}
