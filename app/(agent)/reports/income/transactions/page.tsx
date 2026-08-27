import Link from 'next/link'
import { FileDown, AlertTriangle } from 'lucide-react'
import { requirePermission } from '@/lib/auth/permissions'
import { resolvePeriod } from '@/lib/reports/page-params'
import { toIsoDate } from '@/lib/reports/periods'
import {
  getPaymentTransactions, SOURCE_LABEL, type PaymentTransaction,
} from '@/lib/queries/reports/payment-transactions'
import { METHOD_LABEL } from '@/lib/queries/reports/income-by-method'
import { ReportShell } from '@/components/reports/ReportShell'
import { KpiCard } from '@/components/reports/KpiCard'
import { SimpleTable } from '@/components/reports/SimpleTable'
import { formatBDT } from '@/lib/formatters/currency'
import { formatDateShort } from '@/lib/formatters/dates'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: {
    period?: string; from?: string; to?: string; compare?: string
    method?: string; source?: string; account?: string
  }
}

const SOURCE_TONE: Record<string, string> = {
  advance:     'bg-forest-50 text-forest-800 border-forest-200',
  checkout:    'bg-violet-50 text-violet-800 border-violet-200',
  coffee_shop: 'bg-stone-100 text-stone-800 border-stone-200',
}

/**
 * Every payment, one line each — the sheet accounts works through beside a
 * bank statement. Filterable down to a single account so the page total can
 * be compared directly with one statement's closing figure.
 */
export default async function PaymentTransactionsReport({ searchParams }: PageProps) {
  await requirePermission('reports', 'read')
  const { preset, period, mode, customFrom, customTo } = resolvePeriod(searchParams)
  const fromIso = toIsoDate(period.from)
  const toIso   = toIsoDate(period.to)

  const data = await getPaymentTransactions(fromIso, toIso)

  // Filters narrow the SAME data — the visible total is what you reconcile.
  const rows = data.rows.filter((r) =>
    (!searchParams.method  || r.method === searchParams.method) &&
    (!searchParams.source  || r.source === searchParams.source) &&
    (!searchParams.account || (r.account ?? '') === searchParams.account))
  const shownTotal = Math.round(rows.reduce((s, r) => s + r.amount, 0) * 100) / 100

  const qs = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams()
    p.set('from', fromIso); p.set('to', toIso)
    const merged = {
      method:  searchParams.method,
      source:  searchParams.source,
      account: searchParams.account,
      ...patch,
    }
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v)
    return `/reports/income/transactions?${p.toString()}`
  }

  const printHref = `/reports/print?sections=transactions&from=${fromIso}&to=${toIso}`
    + (searchParams.account ? `&account=${encodeURIComponent(searchParams.account)}` : '')

  return (
    <ReportShell
      title="Payment Transactions"
      subtitle="Every payment, line by line — tick each one against the statement"
      period={period} preset={preset} customFrom={customFrom} customTo={customTo} mode={mode}
      toolbar={
        <a href={printHref}
          className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-forest-700 px-3 text-xs font-semibold text-white">
          <FileDown size={14} /> PDF
        </a>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KpiCard label="Transactions shown" value={rows.length.toLocaleString('en-IN')} mode="off" />
        <KpiCard label="Value shown" value={formatBDT(shownTotal)} mode="off"
          note={rows.length !== data.rows.length ? `of ${formatBDT(data.total)} in range` : undefined} />
        <KpiCard label="Accounts involved" value={String(data.byAccount.length)} mode="off" />
      </div>

      {data.accountsMissing && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle size={15} className="mt-0.5 flex-shrink-0 text-amber-600" />
          <p>
            <strong>Destination accounts aren&apos;t recorded yet.</strong> Run{' '}
            <code className="rounded bg-amber-100 px-1">migrations/platform-audit/004_payment_accounts.sql</code>,
            then name your real banks, wallets and card terminals in{' '}
            <Link href="/settings/payment-accounts" className="underline">Settings → Payment accounts</Link>.
            Until then payments show a method but no account, and a statement can only be matched by hand.
          </p>
        </div>
      )}

      {/* Per-account totals — each row should equal one statement */}
      <div>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
          What each statement should show
        </h2>
        <SimpleTable
          rows={data.byAccount}
          columns={[
            { key: 'account', label: 'Account / wallet / terminal',
              render: (a) => (
                <Link href={qs({ account: a.account })} className="font-medium text-forest-800 hover:underline">
                  {a.account}
                </Link>
              ) },
            { key: 'account_ref', label: 'Reference', render: (a) => a.account_ref ?? '—' },
            { key: 'count',   label: 'Payments', align: 'right' },
            { key: 'total',   label: 'Total',    align: 'right',
              render: (a) => <strong>{formatBDT(a.total)}</strong> },
          ]}
          totals={{
            account: 'All accounts', account_ref: '',
            count: data.rows.length.toLocaleString('en-IN'),
            total: <strong>{formatBDT(data.total)}</strong>,
          }}
        />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-gray-200 bg-white p-3">
        <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Filter</span>
        <Link href={qs({ method: undefined, source: undefined, account: undefined })}
          className={`inline-flex min-h-[32px] items-center rounded-lg border px-2.5 text-xs font-medium ${
            !searchParams.method && !searchParams.source && !searchParams.account
              ? 'border-forest-500 bg-forest-50 text-forest-800' : 'border-gray-300 text-gray-700'}`}>
          All
        </Link>
        {(['advance', 'checkout', 'coffee_shop'] as const).map((s) => (
          <Link key={s} href={qs({ source: searchParams.source === s ? undefined : s })}
            className={`inline-flex min-h-[32px] items-center rounded-lg border px-2.5 text-xs font-medium ${
              searchParams.source === s
                ? 'border-forest-500 bg-forest-50 text-forest-800' : 'border-gray-300 text-gray-700'}`}>
            {SOURCE_LABEL[s]}
          </Link>
        ))}
        {[...new Set(data.rows.map((r) => r.method))].map((m) => (
          <Link key={m} href={qs({ method: searchParams.method === m ? undefined : m })}
            className={`inline-flex min-h-[32px] items-center rounded-lg border px-2.5 text-xs font-medium ${
              searchParams.method === m
                ? 'border-forest-500 bg-forest-50 text-forest-800' : 'border-gray-300 text-gray-700'}`}>
            {METHOD_LABEL[m]}
          </Link>
        ))}
        {searchParams.account && (
          <span className="inline-flex min-h-[32px] items-center gap-1 rounded-lg border border-forest-500 bg-forest-50 px-2.5 text-xs font-medium text-forest-800">
            {searchParams.account}
            <Link href={qs({ account: undefined })} className="ml-0.5 text-forest-600">×</Link>
          </span>
        )}
      </div>

      <SimpleTable<PaymentTransaction>
        rows={rows}
        emptyMessage="No payments match these filters in this period."
        columns={[
          { key: 'date', label: 'When',
            render: (r) => (
              <span className="whitespace-nowrap">
                {formatDateShort(r.date)}
                {r.time && <span className="block text-[11px] text-gray-500">{r.time}</span>}
              </span>
            ) },
          { key: 'party', label: 'Guest / customer',
            render: (r) => (
              <span>
                <span className="block">{r.party ?? '—'}</span>
                {r.document && <span className="block font-mono text-[11px] text-gray-500">{r.document}</span>}
              </span>
            ) },
          { key: 'source', label: 'Type',
            render: (r) => (
              <span className={`inline-flex rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${SOURCE_TONE[r.source]}`}>
                {SOURCE_LABEL[r.source]}
              </span>
            ) },
          { key: 'method', label: 'Method',
            render: (r) => (
              <span>
                {METHOD_LABEL[r.method]}
                {r.card_last4 && <span className="block text-[11px] text-gray-500">•••• {r.card_last4}</span>}
              </span>
            ) },
          { key: 'account', label: 'Landed in',
            render: (r) => r.account
              ? <span>{r.account}{r.account_ref && <span className="block text-[11px] text-gray-500">{r.account_ref}</span>}</span>
              : <span className="text-amber-700">unassigned</span> },
          { key: 'reference', label: 'Reference / slip',
            render: (r) => r.reference
              ? <span className="font-mono text-[11px]">{r.reference}</span>
              : <span className="text-gray-400">—</span> },
          { key: 'amount', label: 'Amount', align: 'right',
            render: (r) => <strong>{formatBDT(r.amount)}</strong> },
        ]}
        totals={{
          date: 'Total', party: '', source: '', method: '', account: '',
          reference: `${rows.length} payment${rows.length === 1 ? '' : 's'}`,
          amount: <strong>{formatBDT(shownTotal)}</strong>,
        }}
      />

      <p className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-xs text-gray-600">
        <strong className="text-gray-800">How to reconcile:</strong> filter to one account, set the range to
        the statement period, and the &ldquo;Value shown&rdquo; figure should equal that statement&apos;s
        credits. Any line here without a statement entry — or any statement entry without a line here — is
        the discrepancy to chase, and each row names the guest, the document and the slip reference to chase it with.
      </p>
    </ReportShell>
  )
}
