import Link from 'next/link'
import { FileDown, MessageCircle, Phone, AlertTriangle } from 'lucide-react'
import { requirePermission } from '@/lib/auth/permissions'
import { Topbar } from '@/components/layout/Topbar'
import { getOutstandingDues, type DueRow } from '@/lib/queries/reports/dues'
import { SimpleTable } from '@/components/reports/SimpleTable'
import { formatBDT } from '@/lib/formatters/currency'
import { formatDate, formatDateShort } from '@/lib/formatters/dates'
import { toWhatsAppUrl } from '@/lib/formatters/phone'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: { minDays?: string }
}

/** The thresholds anyone actually asks for. 6 = "more than 5 days". */
const THRESHOLDS = [
  { days: 1,  label: 'Any overdue' },
  { days: 6,  label: 'More than 5 days' },
  { days: 16, label: 'More than 15 days' },
  { days: 31, label: 'More than 30 days' },
]

const ageTone = (days: number) =>
  days >= 31 ? 'bg-rose-50 text-rose-800 border-rose-200'
  : days >= 16 ? 'bg-orange-50 text-orange-800 border-orange-200'
  : days >= 6  ? 'bg-amber-50 text-amber-800 border-amber-200'
  : 'bg-gray-100 text-gray-700 border-gray-200'

/**
 * Who still owes the resort money, and for how long. A snapshot as of today —
 * not a date range — because a debt is late relative to now, not to a period.
 */
export default async function DuesReport({ searchParams }: PageProps) {
  await requirePermission('reports', 'read')

  const parsed = Number(searchParams.minDays)
  const minDays = Number.isFinite(parsed) && parsed >= 1 && parsed <= 3650
    ? Math.floor(parsed)
    : 6

  const data = await getOutstandingDues(minDays)
  const worst = data.rows[0] ?? null
  const corporate = data.rows.filter((r) => r.is_corporate)
  const corporateTotal = Math.round(corporate.reduce((s, r) => s + r.outstanding, 0) * 100) / 100

  return (
    <div className="flex h-full flex-col">
      <Topbar
        title="Outstanding dues"
        subtitle={`Unpaid balances after checkout · as of ${formatDate(data.asOf)}`}
      />
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 space-y-5">

        {/* Threshold + PDF */}
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-gray-200 bg-white p-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Show</span>
            {THRESHOLDS.map((t) => (
              <Link key={t.days} href={`/reports/dues?minDays=${t.days}`}
                className={`inline-flex min-h-[34px] items-center rounded-lg border px-2.5 text-xs font-medium ${
                  minDays === t.days
                    ? 'border-forest-500 bg-forest-50 text-forest-800'
                    : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}>
                {t.label}
              </Link>
            ))}
            {!THRESHOLDS.some((t) => t.days === minDays) && (
              <span className="inline-flex min-h-[34px] items-center rounded-lg border border-forest-500 bg-forest-50 px-2.5 text-xs font-medium text-forest-800">
                {minDays}+ days
              </span>
            )}
          </div>
          <a href={`/reports/print?sections=dues&minDays=${minDays}`}
            className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-forest-700 px-3 text-xs font-semibold text-white">
            <FileDown size={14} /> PDF
          </a>
        </div>

        {/* Headline */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-rose-700">
              Overdue {minDays > 1 ? `${minDays}+ days` : ''}
            </p>
            <p className="mt-1 text-2xl font-bold text-rose-900">{formatBDT(data.totalOverdue)}</p>
            <p className="mt-0.5 text-xs text-rose-700">
              {data.rows.length} booking{data.rows.length === 1 ? '' : 's'}
            </p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Oldest debt</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">
              {worst ? `${worst.days_overdue} days` : '—'}
            </p>
            <p className="mt-0.5 truncate text-xs text-gray-500">
              {worst ? `${worst.customer_name} · ${formatBDT(worst.outstanding)}` : 'Nothing overdue'}
            </p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Corporate share</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">{formatBDT(corporateTotal)}</p>
            <p className="mt-0.5 text-xs text-gray-500">
              {corporate.length} of {data.rows.length} · usually invoiced, chase by email
            </p>
          </div>
        </div>

        {/* Ageing buckets — always the FULL picture, regardless of threshold */}
        <div>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Ageing — every overdue booking
          </h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {data.buckets.map((b) => (
              <div key={b.label}
                className={`rounded-xl border p-3 ${b.count > 0 ? ageTone(b.from) : 'border-gray-200 bg-white'}`}>
                <p className="text-[11px] font-semibold">{b.label}</p>
                <p className="mt-1 text-lg font-bold tabular-nums">{formatBDT(b.total)}</p>
                <p className="text-[11px] opacity-80">{b.count} booking{b.count === 1 ? '' : 's'}</p>
              </div>
            ))}
          </div>
        </div>

        {/* The worklist */}
        <SimpleTable<DueRow>
          rows={data.rows}
          emptyMessage={
            data.allRows.length === 0
              ? 'Nothing outstanding — every departed guest has settled.'
              : `Nothing is ${minDays} days or more overdue. ${data.allRows.length} younger balance${data.allRows.length === 1 ? '' : 's'} still open.`
          }
          columns={[
            { key: 'days_overdue', label: 'Overdue',
              render: (r) => (
                <span className={`inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-bold ${ageTone(r.days_overdue)}`}>
                  {r.days_overdue} d
                </span>
              ) },
            { key: 'customer_name', label: 'Guest',
              render: (r) => (
                <span>
                  <Link href={`/bookings/${r.booking_id}`} className="font-medium text-forest-800 hover:underline">
                    {r.customer_name}
                  </Link>
                  {r.is_corporate && r.company_name && (
                    <span className="block text-[11px] text-gray-500">{r.company_name}</span>
                  )}
                </span>
              ) },
            { key: 'booking_number', label: 'Booking',
              render: (r) => (
                <span>
                  <span className="block font-mono text-[11px]">{r.booking_number}</span>
                  <span className="block text-[11px] text-gray-500">
                    left {formatDateShort(r.due_since)}
                  </span>
                </span>
              ) },
            { key: 'total_bill', label: 'Bill', align: 'right',
              render: (r) => formatBDT(r.total_bill) },
            { key: 'collected', label: 'Paid', align: 'right',
              render: (r) => formatBDT(r.collected) },
            { key: 'outstanding', label: 'Still owed', align: 'right',
              render: (r) => <strong className="text-rose-800">{formatBDT(r.outstanding)}</strong> },
            { key: 'customer_phone', label: 'Chase',
              render: (r) => (
                <span className="flex items-center gap-2 whitespace-nowrap">
                  <a href={`tel:${r.customer_phone}`} className="text-gray-600 hover:text-forest-700"
                    title={r.customer_phone}>
                    <Phone size={14} />
                  </a>
                  <a href={toWhatsAppUrl(r.customer_phone)} target="_blank" rel="noreferrer"
                    className="text-emerald-700 hover:text-emerald-900" title="WhatsApp">
                    <MessageCircle size={14} />
                  </a>
                  <span className="text-[11px] text-gray-500">{r.customer_phone}</span>
                </span>
              ) },
          ]}
          totals={{
            days_overdue: 'Total',
            customer_name: '', booking_number: '', total_bill: '', collected: '',
            outstanding: <strong className="text-rose-800">{formatBDT(data.totalOverdue)}</strong>,
            customer_phone: `${data.rows.length} to chase`,
          }}
        />

        <p className="flex items-start gap-2 rounded-xl border border-gray-200 bg-gray-50 p-3 text-xs text-gray-600">
          <AlertTriangle size={14} className="mt-0.5 flex-shrink-0 text-gray-400" />
          <span>
            A balance counts as overdue from the day the guest left — the checkout date, or the visit
            date for a daylong. Future stays with an unpaid balance are not shown; nothing is late
            until the guest has been and gone. Cancelled and no-show bookings are excluded. The
            amounts match the checkout screen exactly, so opening a booking here and taking payment
            there clears it from this list.
          </span>
        </p>
      </div>
    </div>
  )
}
