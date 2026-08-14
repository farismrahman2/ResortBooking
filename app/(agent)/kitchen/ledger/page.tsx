import Link from 'next/link'
import { Wallet, PackageCheck, TrendingUp } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { requirePermission, hasPermission } from '@/lib/auth/permissions'
import { getVendorLedger, getDeliverySpend } from '@/lib/queries/kitchen-ledger'
import { getDayMealHeadcounts } from '@/lib/queries/menus'
import type { DayMealHeadcounts } from '@/lib/queries/menus'
import { KitchenNav } from '@/components/kitchen/KitchenNav'
import { MigrationErrorBanner } from '@/components/ui/MigrationErrorBanner'
import { formatDate } from '@/lib/formatters/dates'
import { formatBDT } from '@/lib/formatters/currency'

export const dynamic = 'force-dynamic'

/** Last 30 days, ending today in Dhaka. */
function defaultRange(): { from: string; to: string } {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Dhaka' }))
  const to = now.toISOString().slice(0, 10)
  now.setDate(now.getDate() - 29)
  return { from: now.toISOString().slice(0, 10), to }
}

export default async function LedgerPage({
  searchParams,
}: {
  searchParams: { from?: string; to?: string }
}) {
  await requirePermission('kitchen', 'read')
  const canWrite = await hasPermission('kitchen', 'write')

  try {
    const d = defaultRange()
    const from = searchParams.from ?? d.from
    const to   = searchParams.to   ?? d.to

    const [ledger, spend] = await Promise.all([
      // No range: outstanding is a running position, not a period figure.
      // Filtering it by date would show a supplier as settled purely because
      // the delivery fell outside the window.
      getVendorLedger(),
      getDeliverySpend(from, to),
    ])

    // Cost per cover. Pax comes from live bookings via the same meal engine the
    // daily report uses, so this can't drift from what the menus module says.
    const days: string[] = []
    for (let t = new Date(`${from}T00:00:00`); t <= new Date(`${to}T00:00:00`); t.setDate(t.getDate() + 1)) {
      days.push(t.toISOString().slice(0, 10))
    }
    const headcounts = await Promise.all(
      days.map((day) => getDayMealHeadcounts(day).catch(() => ({} as DayMealHeadcounts))),
    )
    // A cover is one person eating one main meal; the busiest sitting is the
    // day's figure, matching how the kitchen itself counts.
    const covers = headcounts.reduce<number>((n, h) => (
      n + Math.max(0, ...(['breakfast', 'lunch', 'dinner'] as const).map((m) => h[m]?.total ?? 0))
    ), 0)
    const perCover = covers > 0 ? spend.total / covers : null

    const owed = ledger.filter((r) => Math.abs(r.outstanding) > 0.009)
    const totalOwed = ledger.reduce((n, r) => n + Math.max(0, r.outstanding), 0)

    return (
      <div className="flex h-full flex-col">
        <Topbar title="Supplier ledger" subtitle="What each supplier is owed" />
        <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
          <div className="mx-auto max-w-4xl space-y-4">
            <KitchenNav current="ledger" />

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-gray-200 bg-white p-4">
                <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-gray-500">
                  <Wallet size={13} /> Outstanding
                </p>
                <p className={`mt-1 text-2xl font-bold ${totalOwed > 0 ? 'text-red-700' : 'text-green-700'}`}>
                  {formatBDT(totalOwed)}
                </p>
                <p className="text-[11px] text-gray-500">across all suppliers, all time</p>
              </div>
              <div className="rounded-xl border border-gray-200 bg-white p-4">
                <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-gray-500">
                  <PackageCheck size={13} /> Spent
                </p>
                <p className="mt-1 text-2xl font-bold text-gray-900">{formatBDT(spend.total)}</p>
                <p className="text-[11px] text-gray-500">{formatDate(from)} → {formatDate(to)}</p>
              </div>
              <div className="rounded-xl border border-gray-200 bg-white p-4">
                <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-gray-500">
                  <TrendingUp size={13} /> Per cover
                </p>
                <p className="mt-1 text-2xl font-bold text-gray-900">
                  {perCover === null ? '—' : formatBDT(perCover)}
                </p>
                <p className="text-[11px] text-gray-500">
                  {covers > 0 ? `${covers.toLocaleString()} covers in the period` : 'no bookings in the period'}
                </p>
              </div>
            </div>

            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
              <p className="border-b border-gray-200 bg-gray-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-gray-600">
                By supplier
              </p>
              <ul className="divide-y divide-gray-100">
                {ledger.map((r) => (
                  <li key={r.vendor.id} className="flex items-center gap-3 px-4 py-3">
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-gray-900">{r.vendor.display_name}</span>
                      <span className="block text-[11px] text-gray-500">
                        {formatBDT(r.delivered)} delivered · {formatBDT(r.paid)} paid
                        {r.open_bills > 0 ? ` · ${r.open_bills} open bill${r.open_bills === 1 ? '' : 's'}` : ''}
                      </span>
                      {r.last_delivery_date && (
                        <span className="block text-[11px] text-gray-400">
                          last delivery {formatDate(r.last_delivery_date)}
                        </span>
                      )}
                    </span>
                    <span className="flex-shrink-0 text-right">
                      <span className={`block text-sm font-bold ${
                        r.outstanding > 0.009 ? 'text-red-700'
                          : r.outstanding < -0.009 ? 'text-blue-700' : 'text-gray-400'}`}>
                        {formatBDT(Math.abs(r.outstanding))}
                      </span>
                      <span className="block text-[10px] uppercase tracking-wide text-gray-500">
                        {r.outstanding > 0.009 ? 'due' : r.outstanding < -0.009 ? 'in advance' : 'settled'}
                      </span>
                    </span>
                    {canWrite && r.outstanding > 0.009 && (
                      <Link
                        href={`/kitchen/payments/new?vendor=${r.vendor.id}`}
                        className="inline-flex min-h-[36px] flex-shrink-0 items-center rounded-lg bg-forest-700 px-2.5 text-xs font-semibold text-white"
                      >
                        Pay
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>

            {owed.length === 0 && (
              <p className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
                Every supplier is settled.
              </p>
            )}

            <p className="px-1 text-[11px] leading-relaxed text-gray-500">
              Outstanding is a running position over all time — filtering it by date would show a
              supplier as settled just because the delivery fell outside the window. Spend and
              cost per cover are for the period shown.
            </p>
          </div>
        </div>
      </div>
    )
  } catch (err) {
    return (
      <div className="px-4 py-6">
        <MigrationErrorBanner
          error={err instanceof Error ? err.message : String(err)}
          moduleName="Kitchen"
          migrationPath="migrations/kitchen-module/003_phase2_deliveries_payments.sql"
        />
      </div>
    )
  }
}
