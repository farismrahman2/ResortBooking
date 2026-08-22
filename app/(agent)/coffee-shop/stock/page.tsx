import Link from 'next/link'
import { ChevronLeft, PackagePlus, ClipboardList, AlertTriangle } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { requirePermission } from '@/lib/auth/permissions'
import { getCoffeeShopStockReport } from '@/lib/queries/coffee-shop-stock'
import { MigrationErrorBanner } from '@/components/coffee-shop/MigrationErrorBanner'
import { formatDateShort } from '@/lib/formatters/dates'
import { todayDhaka, monthStartDhaka } from '@/lib/dates'

export const dynamic = 'force-dynamic'

const num = (n: number) => (Number.isInteger(n) ? n.toLocaleString('en-IN') : n.toFixed(2))

/**
 * The counter's leakage sheet. Entered − sold − comps − staff issues −
 * write-offs should equal what's on the shelf; the count-variance column is
 * where the difference shows, and a red number is stock that left with no
 * record — the thing this page exists to catch.
 */
export default async function CoffeeShopStockPage({
  searchParams,
}: {
  searchParams: { from?: string; to?: string }
}) {
  await requirePermission('coffee_shop', 'read')

  const today = todayDhaka()
  const from = searchParams.from ?? monthStartDhaka(today)
  const to   = searchParams.to   ?? today

  try {
    const report = await getCoffeeShopStockReport(from, to)

    return (
      <div className="flex h-full flex-col">
        <Topbar title="Coffee Shop Stock" subtitle="Entered, sold, complimentary — and what the counts say" />
        <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
          <div className="mx-auto max-w-5xl space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Link href="/coffee-shop" className="inline-flex items-center gap-1 text-sm text-forest-700 hover:underline">
                <ChevronLeft size={15} /> Coffee shop
              </Link>
              <form className="ml-auto flex flex-wrap items-center gap-2" action="/coffee-shop/stock">
                <input type="date" name="from" defaultValue={from}
                  className="min-h-[38px] rounded-lg border border-gray-300 px-2 text-sm" />
                <span className="text-sm text-gray-500">to</span>
                <input type="date" name="to" defaultValue={to}
                  className="min-h-[38px] rounded-lg border border-gray-300 px-2 text-sm" />
                <button type="submit"
                  className="min-h-[38px] rounded-lg bg-forest-700 px-3 text-xs font-semibold text-white">
                  Apply
                </button>
              </form>
            </div>

            {!report ? (
              <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
                The Coffee Shop store hasn&apos;t been created yet — run{' '}
                <code className="rounded bg-amber-100 px-1">migrations/coffee-shop-module/002_inventory_link.sql</code>{' '}
                and this page comes alive.
              </div>
            ) : (
              <>
                <div className="flex flex-wrap gap-2">
                  <Link href="/inventory/coffee_shop"
                    className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 text-xs font-medium text-gray-700">
                    <PackagePlus size={14} /> Stock items &amp; receipts
                  </Link>
                  <Link href="/inventory/counts"
                    className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 text-xs font-medium text-gray-700">
                    <ClipboardList size={14} /> Count sheets
                  </Link>
                  <Link href="/settings/charge-catalog"
                    className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 text-xs font-medium text-gray-700">
                    Link menu items → stock
                  </Link>
                </div>

                {report.rows.length === 0 ? (
                  <p className="rounded-xl border-2 border-dashed border-gray-300 bg-white px-4 py-12 text-center text-sm text-gray-500">
                    No stock items yet. Add them under <strong>Stock items &amp; receipts</strong>,
                    then link each menu item to its stock item in the charge catalog —
                    from then on every sale deducts automatically.
                  </p>
                ) : (
                  <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[780px] text-sm">
                        <thead>
                          <tr className="border-b border-gray-200 bg-gray-50 text-left text-[11px] uppercase tracking-wide text-gray-500">
                            <th className="px-3 py-2 font-semibold">Item</th>
                            <th className="px-2 py-2 text-right font-semibold">Entered</th>
                            <th className="px-2 py-2 text-right font-semibold">Sold</th>
                            <th className="px-2 py-2 text-right font-semibold">Comp</th>
                            <th className="px-2 py-2 text-right font-semibold">Staff / other</th>
                            <th className="px-2 py-2 text-right font-semibold">Write-offs</th>
                            <th className="px-2 py-2 text-right font-semibold">Count variance</th>
                            <th className="px-3 py-2 text-right font-semibold">On hand now</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {report.rows.map((r) => (
                            <tr key={r.item_id} className="hover:bg-gray-50/60">
                              <td className="px-3 py-2.5">
                                <p className="font-medium text-gray-900">{r.name}</p>
                                <p className="text-[11px] text-gray-500">
                                  {r.last_entered ? `last entered ${formatDateShort(r.last_entered)}` : 'never received'}
                                </p>
                              </td>
                              <td className="px-2 py-2.5 text-right tabular-nums text-gray-800">
                                {num(r.entered)}{r.unit_abbr ? ` ${r.unit_abbr}` : ''}
                              </td>
                              <td className="px-2 py-2.5 text-right tabular-nums text-gray-800">{num(r.sold)}</td>
                              <td className="px-2 py-2.5 text-right tabular-nums">
                                {r.comp > 0
                                  ? <span className="font-semibold text-amber-700">{num(r.comp)}</span>
                                  : <span className="text-gray-400">—</span>}
                              </td>
                              <td className="px-2 py-2.5 text-right tabular-nums text-gray-600">
                                {r.issued_other > 0 ? num(r.issued_other) : <span className="text-gray-400">—</span>}
                              </td>
                              <td className="px-2 py-2.5 text-right tabular-nums text-gray-600">
                                {r.adjusted !== 0 ? num(r.adjusted) : <span className="text-gray-400">—</span>}
                              </td>
                              <td className="px-2 py-2.5 text-right tabular-nums">
                                {r.count_variance === 0
                                  ? <span className="text-gray-400">—</span>
                                  : (
                                    <span className={r.count_variance < 0 ? 'font-bold text-red-600' : 'font-semibold text-emerald-700'}>
                                      {r.count_variance > 0 ? '+' : ''}{num(r.count_variance)}
                                    </span>
                                  )}
                              </td>
                              <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-gray-900">
                                {num(r.current_stock)}{r.unit_abbr ? ` ${r.unit_abbr}` : ''}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                <div className="flex items-start gap-2 rounded-xl border border-gray-200 bg-gray-50 p-3 text-xs text-gray-600">
                  <AlertTriangle size={14} className="mt-0.5 flex-shrink-0 text-gray-400" />
                  <p>
                    <strong className="text-gray-800">Reading the sheet:</strong>{' '}
                    Entered − Sold − Comp − Staff − Write-offs should equal what&apos;s on the shelf.
                    Run a <Link href="/inventory/counts" className="underline">count sheet</Link> to compare —
                    a <span className="font-semibold text-red-600">red count variance</span> is stock that
                    left with no sale, no comp, and no write-off recorded. That&apos;s the leakage.
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    )
  } catch (err) {
    if (err && typeof err === 'object' && 'digest' in err) throw err
    return (
      <div className="px-4 py-6">
        <MigrationErrorBanner error={err instanceof Error ? err.message : String(err)} />
      </div>
    )
  }
}
