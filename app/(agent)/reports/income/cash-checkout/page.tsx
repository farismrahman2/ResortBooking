import { FileDown } from 'lucide-react'
import { requirePermission } from '@/lib/auth/permissions'
import { resolvePeriod } from '@/lib/reports/page-params'
import { toIsoDate } from '@/lib/reports/periods'
import { getCashCheckoutReport, type CashCheckoutRow } from '@/lib/queries/reports/cash-checkout'
import { ReportShell } from '@/components/reports/ReportShell'
import { KpiCard } from '@/components/reports/KpiCard'
import { SimpleTable } from '@/components/reports/SimpleTable'
import { formatBDT } from '@/lib/formatters/currency'
import { formatDateShort } from '@/lib/formatters/dates'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: { period?: string; from?: string; to?: string; compare?: string }
}

/**
 * Cash taken at checkout, and nothing else — the sheet that should equal the
 * notes counted in the drawer for the month.
 */
export default async function CashCheckoutReport({ searchParams }: PageProps) {
  await requirePermission('reports', 'read')
  const { preset, period, mode, customFrom, customTo } = resolvePeriod(searchParams)
  const fromIso = toIsoDate(period.from)
  const toIso   = toIsoDate(period.to)

  const data = await getCashCheckoutReport(fromIso, toIso)

  return (
    <ReportShell
      title="Cash Checkout"
      subtitle="Cash taken at checkout — no advances, no cards, no transfers"
      period={period} preset={preset} customFrom={customFrom} customTo={customTo} mode={mode}
      toolbar={
        <a href={`/reports/print?sections=cash&from=${fromIso}&to=${toIso}`}
          className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-forest-700 px-3 text-xs font-semibold text-white">
          <FileDown size={14} /> PDF
        </a>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <KpiCard label="Total cash collected" value={formatBDT(data.total)} mode="off"
          note={`${data.rows.length} payment${data.rows.length === 1 ? '' : 's'} across ${data.byDate.length} day${data.byDate.length === 1 ? '' : 's'}`} />
        <KpiCard label="Busiest cash day" mode="off"
          value={data.byDate.length
            ? formatBDT(Math.max(...data.byDate.map((d) => d.total)))
            : '—'}
          note={data.byDate.length
            ? formatDateShort(data.byDate.reduce((a, b) => (b.total > a.total ? b : a)).date)
            : undefined} />
      </div>

      <SimpleTable<CashCheckoutRow>
        rows={data.rows}
        emptyMessage="No cash was taken at checkout in this period."
        columns={[
          { key: 'date', label: 'Date',
            render: (r) => <span className="whitespace-nowrap">{formatDateShort(r.date)}</span> },
          { key: 'booking_number', label: 'Booking',
            render: (r) => (
              <span>
                <span className="block font-mono text-[13px]">{r.booking_number}</span>
                <span className="block text-[11px] text-gray-500">{r.customer_name}</span>
              </span>
            ) },
          { key: 'amount', label: 'Cash', align: 'right',
            render: (r) => <strong>{formatBDT(r.amount)}</strong> },
        ]}
        totals={{
          date: 'Total',
          booking_number: `${data.rows.length} payment${data.rows.length === 1 ? '' : 's'}`,
          amount: <strong>{formatBDT(data.total)}</strong>,
        }}
      />

      {data.byDate.length > 1 && (
        <div>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Day by day
          </h2>
          <SimpleTable
            rows={data.byDate}
            columns={[
              { key: 'date', label: 'Date', render: (d) => formatDateShort(d.date) },
              { key: 'count', label: 'Payments', align: 'right' },
              { key: 'total', label: 'Cash', align: 'right',
                render: (d) => <strong>{formatBDT(d.total)}</strong> },
            ]}
            totals={{
              date: 'Total',
              count: data.rows.length,
              total: <strong>{formatBDT(data.total)}</strong>,
            }}
          />
        </div>
      )}
    </ReportShell>
  )
}
