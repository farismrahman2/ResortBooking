import Link from 'next/link'
import { FileDown, ListChecks } from 'lucide-react'
import { requirePermission } from '@/lib/auth/permissions'
import { resolvePeriod } from '@/lib/reports/page-params'
import { toIsoDate } from '@/lib/reports/periods'
import {
  getIncomeByMethodRange, METHOD_LABEL, PAYMENT_METHODS,
  type MethodRangeRow, type MethodDailyRow,
} from '@/lib/queries/reports/income-by-method'
import { ReportShell } from '@/components/reports/ReportShell'
import { KpiCard } from '@/components/reports/KpiCard'
import { SimpleTable } from '@/components/reports/SimpleTable'
import { formatBDT } from '@/lib/formatters/currency'
import { formatDateShort } from '@/lib/formatters/dates'

export const dynamic = 'force-dynamic'

interface PageProps { searchParams: { period?: string; from?: string; to?: string; compare?: string } }

/**
 * The reconciliation sheet: everything received over the range, by payment
 * method — advances (all bKash at this resort), checkout payments, and
 * coffee-shop takings — for matching against what accounts actually banked.
 */
export default async function ReceivedByMethodReport({ searchParams }: PageProps) {
  await requirePermission('reports', 'read')
  const { preset, period, mode, customFrom, customTo } = resolvePeriod(searchParams)
  const fromIso = toIsoDate(period.from)
  const toIso   = toIsoDate(period.to)

  const data = await getIncomeByMethodRange(fromIso, toIso)
  const nonZero = data.rows.filter((r) => r.total > 0)
  const days = Math.max(1, data.daily.length)

  const printHref = `/reports/print?sections=money&from=${fromIso}&to=${toIso}`

  return (
    <ReportShell
      title="Money Received by Method"
      subtitle="Advance instalments + checkout + coffee shop — the sheet accounts matches against statements"
      period={period} preset={preset} customFrom={customFrom} customTo={customTo} mode={mode}
      toolbar={
        <>
        <Link href={`/reports/income/transactions?from=${fromIso}&to=${toIso}`}
          className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 text-xs font-medium text-gray-700">
          <ListChecks size={14} /> Every transaction
        </Link>
        <a href={printHref}
          className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-forest-700 px-3 text-xs font-semibold text-white">
          <FileDown size={14} /> PDF
        </a>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <KpiCard label="Total received" value={formatBDT(data.totals.total)} mode="off" />
        <KpiCard label="Booking advances" value={formatBDT(data.totals.advances)} mode="off" note="by instalment, as received" />
        <KpiCard label="Checkout payments" value={formatBDT(data.totals.checkout)} mode="off" />
        <KpiCard label="Coffee shop" value={formatBDT(data.totals.coffee_shop)} mode="off" />
      </div>

      <SimpleTable<MethodRangeRow>
        rows={nonZero.length ? nonZero : data.rows}
        columns={[
          { key: 'method',      label: 'Method', render: (r) => <strong>{METHOD_LABEL[r.method]}</strong> },
          { key: 'advances',    label: 'Advances',    align: 'right', render: (r) => r.advances ? formatBDT(r.advances) : '—' },
          { key: 'checkout',    label: 'Checkout',    align: 'right', render: (r) => r.checkout ? formatBDT(r.checkout) : '—' },
          { key: 'coffee_shop', label: 'Coffee shop', align: 'right', render: (r) => r.coffee_shop ? formatBDT(r.coffee_shop) : '—' },
          { key: 'total',       label: 'Total',       align: 'right', render: (r) => <strong>{formatBDT(r.total)}</strong> },
        ]}
        totals={{
          method:      'Total',
          advances:    formatBDT(data.totals.advances),
          checkout:    formatBDT(data.totals.checkout),
          coffee_shop: formatBDT(data.totals.coffee_shop),
          total:       <strong>{formatBDT(data.totals.total)}</strong>,
        }}
      />

      {data.daily.length > 0 && days <= 62 && (
        <SimpleTable<MethodDailyRow>
          rows={data.daily}
          columns={[
            { key: 'date', label: 'Date', render: (r) => formatDateShort(r.date) },
            ...PAYMENT_METHODS
              .filter((m) => data.rows.find((r) => r.method === m && r.total > 0))
              .map((m) => ({
                key: m as string, label: METHOD_LABEL[m], align: 'right' as const,
                render: (r: MethodDailyRow) => r.byMethod[m] ? formatBDT(r.byMethod[m]) : '—',
              })),
            { key: 'total', label: 'Total', align: 'right',
              render: (r) => <strong>{formatBDT(r.total)}</strong> },
          ]}
        />
      )}

      <p className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-xs text-gray-600">
        Basis: each advance instalment counts on the day it actually arrived, in the method it
        arrived by — so a bKash part-payment and a later bank transfer land in different columns
        and different days. Advances are non-refundable, so cancellations stay included: the money
        was received. Checkout payments carry their own method and payment time; coffee-shop
        takings their sale date.
      </p>
    </ReportShell>
  )
}
