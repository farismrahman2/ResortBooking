import Link from 'next/link'
import { Topbar } from '@/components/layout/Topbar'
import { MigrationErrorBanner } from '@/components/checkout/MigrationErrorBanner'
import { CheckoutFilterBar } from './CheckoutListClient'
import { listCheckoutCandidates } from '@/lib/queries/checkout'
import { requirePermission, getCurrentUserContext } from '@/lib/auth/permissions'
import { CHECKOUT_STATUS_BADGE, CHECKOUT_STATUS_LABELS } from '@/components/checkout/labels'
import { formatBDT } from '@/lib/formatters/currency'
import { formatDate } from '@/lib/formatters/dates'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: { filter?: string }
}

const VALID_FILTERS = ['today', 'drafts', 'finalized', 'all'] as const
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

  let migrationError: string | null = null
  let rows: Awaited<ReturnType<typeof listCheckoutCandidates>> = []
  try {
    rows = await listCheckoutCandidates({ filter, maxVisitDate, minVisitDate })
  } catch (err) {
    migrationError = err instanceof Error ? err.message : String(err)
  }

  return (
    <div className="flex h-full flex-col">
      <Topbar title="Checkout" subtitle="Guest checkouts — review, charge, settle" />
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 space-y-4">
        {migrationError && <MigrationErrorBanner error={migrationError} />}

        <CheckoutFilterBar active={filter} />

        {rows.length === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-white p-12 text-center">
            <p className="text-sm font-medium text-gray-700">
              {filter === 'today'
                ? 'No checkouts today.'
                : filter === 'drafts'
                  ? 'No draft checkouts.'
                  : filter === 'finalized'
                    ? 'No finalized checkouts in the last 30 days.'
                    : 'No bookings match.'}
            </p>
            <p className="mt-1 text-xs text-gray-500">
              Charges and payments are added from the booking detail page during the stay.
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[820px]">
                <thead className="border-b border-gray-200 bg-gray-50">
                  <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
                    <th className="px-4 py-2.5 font-medium">Booking</th>
                    <th className="px-4 py-2.5 font-medium">Guest</th>
                    <th className="px-4 py-2.5 font-medium">Stay</th>
                    <th className="px-4 py-2.5 text-right font-medium">Booking Total</th>
                    <th className="px-4 py-2.5 text-right font-medium">Net Due</th>
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
                          {r.checkout
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
