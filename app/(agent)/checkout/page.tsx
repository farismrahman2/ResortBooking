import Link from 'next/link'
import { Topbar } from '@/components/layout/Topbar'
import { MigrationErrorBanner } from '@/components/checkout/MigrationErrorBanner'
import { CheckoutFilterBar } from './CheckoutListClient'
import { listCheckoutCandidates, PAST_DUE_WINDOW_DAYS } from '@/lib/queries/checkout'
import { requirePermission, getCurrentUserContext } from '@/lib/auth/permissions'
import { CHECKOUT_STATUS_BADGE, CHECKOUT_STATUS_LABELS } from '@/components/checkout/labels'
import { formatBDT } from '@/lib/formatters/currency'
import { formatDate } from '@/lib/formatters/dates'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: { filter?: string }
}

const VALID_FILTERS = ['today', 'past_due', 'drafts', 'finalized', 'all'] as const
type Filter = typeof VALID_FILTERS[number]

export default async function CheckoutListPage({ searchParams }: PageProps) {
  await requirePermission('checkout', 'read')

  const filter: Filter = VALID_FILTERS.includes(searchParams.filter as Filter)
    ? (searchParams.filter as Filter)
    : 'today'

  // Front desk only sees bookings within today − 3 days through today + 2
  // days. Other roles keep the default 30-day past window and no future cap.
  const ctx = await getCurrentUserContext()
  const isFrontDesk = ctx?.profile.role.slug === 'front_desk'
  const maxVisitDate = isFrontDesk
    ? new Date(Date.now() + 2 * 24 * 3600 * 1000).toISOString().slice(0, 10)
    : undefined
  const minVisitDate = isFrontDesk
    ? new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString().slice(0, 10)
    : undefined

  const isPastDue = filter === 'past_due'

  let migrationError: string | null = null
  let rows: Awaited<ReturnType<typeof listCheckoutCandidates>> = []
  let pastDueCount = 0
  try {
    // Past due ages from the departure date, so it deliberately ignores the
    // front-desk visit-date window — an unpaid guest who left three weeks ago
    // is exactly who this tab exists to surface.
    const [listed, pastDue] = await Promise.all([
      listCheckoutCandidates(
        isPastDue ? { filter } : { filter, maxVisitDate, minVisitDate },
      ),
      // The badge is always live, so nobody has to open the tab to learn it
      // is empty. Reuses the same call the tab itself makes.
      isPastDue
        ? Promise.resolve(null)
        : listCheckoutCandidates({ filter: 'past_due' }).catch(() => []),
    ])
    rows = listed
    pastDueCount = isPastDue ? listed.length : (pastDue?.length ?? 0)
  } catch (err) {
    migrationError = err instanceof Error ? err.message : String(err)
  }

  const pastDueTotal = isPastDue
    ? Math.round(rows.reduce((s, r) => s + r.outstanding, 0) * 100) / 100
    : 0

  return (
    <div className="flex h-full flex-col">
      <Topbar title="Checkout" subtitle="Guest checkouts — review, charge, settle" />
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 space-y-4">
        {migrationError && <MigrationErrorBanner error={migrationError} />}

        <CheckoutFilterBar active={filter} pastDueCount={pastDueCount} />

        {isPastDue && rows.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
            <p className="text-sm text-red-900">
              <strong>{rows.length} guest{rows.length === 1 ? '' : 's'}</strong> left in the last{' '}
              {PAST_DUE_WINDOW_DAYS} days without settling. Today&apos;s departures are on the{' '}
              <strong>Today</strong> tab — they are not late yet.
            </p>
            <p className="font-mono text-lg font-bold tabular-nums text-red-900">
              {formatBDT(pastDueTotal)}
            </p>
          </div>
        )}

        {rows.length === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-white p-12 text-center">
            <p className="text-sm font-medium text-gray-700">
              {filter === 'today'
                ? 'No checkouts today.'
                : filter === 'past_due'
                  ? `Nothing uncollected in the last ${PAST_DUE_WINDOW_DAYS} days.`
                  : filter === 'drafts'
                    ? 'No draft checkouts.'
                    : filter === 'finalized'
                      ? 'No finalized checkouts in the last 30 days.'
                      : 'No bookings match.'}
            </p>
            <p className="mt-1 text-xs text-gray-500">
              {filter === 'past_due'
                ? 'Every guest who has left in that window has settled their bill.'
                : 'Charges and payments are added from the booking detail page during the stay.'}
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[820px]">
                <thead className="border-b border-gray-200 bg-gray-50">
                  <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
                    {isPastDue && <th className="px-4 py-2.5 font-medium">Overdue</th>}
                    <th className="px-4 py-2.5 font-medium">Booking</th>
                    <th className="px-4 py-2.5 font-medium">Guest</th>
                    <th className="px-4 py-2.5 font-medium">Stay</th>
                    <th className="px-4 py-2.5 text-right font-medium">Booking Total</th>
                    <th className="px-4 py-2.5 text-right font-medium">
                      {isPastDue ? 'Still Owed' : 'Net Due'}
                    </th>
                    <th className="px-4 py-2.5 font-medium">Checkout</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rows.map((r) => {
                    const stayLabel = r.check_out_date
                      ? `${formatDate(r.visit_date)} → ${formatDate(r.check_out_date)}`
                      : `${formatDate(r.visit_date)} (Daylong)`
                    const isRefund = r.checkout && r.checkout.net_due < 0
                    return (
                      <tr key={r.booking_id} className="hover:bg-gray-50/60">
                        {isPastDue && (
                          <td className="px-4 py-2.5 align-top">
                            <span className={`inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-bold ${
                              r.days_overdue >= 15
                                ? 'border-red-200 bg-red-50 text-red-800'
                                : r.days_overdue >= 6
                                  ? 'border-orange-200 bg-orange-50 text-orange-800'
                                  : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
                              {r.days_overdue} d
                            </span>
                          </td>
                        )}
                        <td className="px-4 py-2.5 align-top">
                          <Link href={`/checkout/${r.booking_id}`} className="font-mono text-sm font-medium text-violet-700 hover:underline">
                            {r.booking_number}
                          </Link>
                        </td>
                        <td className="px-4 py-2.5 align-top">
                          <p className="font-medium text-gray-900">{r.customer_name}</p>
                          <p className="text-xs text-gray-500">{r.customer_phone}</p>
                        </td>
                        <td className="px-4 py-2.5 align-top text-xs text-gray-600">{stayLabel}</td>
                        <td className="px-4 py-2.5 align-top text-right font-mono tabular-nums">{formatBDT(r.total)}</td>
                        <td className="px-4 py-2.5 align-top text-right font-mono tabular-nums">
                          {isPastDue
                            // Always a figure here, even with no checkout started —
                            // those are the ones that get forgotten, and a dash
                            // would hide the money.
                            ? <span className="font-semibold text-red-700">{formatBDT(r.outstanding)}</span>
                            : r.checkout
                              ? <span className={isRefund ? 'text-teal-700' : 'text-violet-700 font-semibold'}>
                                  {isRefund ? `Refund ${formatBDT(Math.abs(r.checkout.net_due))}` : formatBDT(r.checkout.net_due)}
                                </span>
                              : <span className="text-gray-400">—</span>}
                        </td>
                        <td className="px-4 py-2.5 align-top">
                          {r.checkout ? (
                            <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${CHECKOUT_STATUS_BADGE[r.checkout.status]}`}>
                              {CHECKOUT_STATUS_LABELS[r.checkout.status]}
                            </span>
                          ) : (
                            <span className="text-xs text-gray-400">Not started</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
