import Link from 'next/link'
import { format } from 'date-fns'
import { Plus } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { Button } from '@/components/ui/Button'
import { requirePermission, hasPermission } from '@/lib/auth/permissions'
import { listCoffeeShopSales } from '@/lib/queries/coffee-shop'
import { MigrationErrorBanner } from '@/components/coffee-shop/MigrationErrorBanner'
import { STATUS_BADGE } from '@/components/coffee-shop/labels'
import { formatBDT } from '@/lib/formatters/currency'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: { from?: string; to?: string; status?: 'completed' | 'voided' | 'all'; q?: string }
}

export default async function CoffeeShopSalesListPage({ searchParams }: PageProps) {
  await requirePermission('coffee_shop', 'read')
  const canWrite = await hasPermission('coffee_shop', 'write')

  const today = new Date()
  const defaultFromIso = new Date(today.getTime() - 6 * 86400_000).toISOString().slice(0, 10)
  const defaultToIso   = today.toISOString().slice(0, 10)
  const from   = searchParams.from   ?? defaultFromIso
  const to     = searchParams.to     ?? defaultToIso
  const status = searchParams.status ?? 'completed'
  const q      = searchParams.q ?? ''

  let migrationError: string | null = null
  let sales: Awaited<ReturnType<typeof listCoffeeShopSales>> = []
  try {
    sales = await listCoffeeShopSales({
      from_date: from, to_date: to,
      status: status === 'all' ? 'all' : status,
      search: q || undefined,
      limit: 500,
    })
  } catch (err) {
    migrationError = err instanceof Error ? err.message : String(err)
  }

  return (
    <div className="flex h-full flex-col">
      <Topbar title="Coffee Shop sales" subtitle="All recorded transactions" />
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 space-y-4">
        {migrationError && <MigrationErrorBanner error={migrationError} />}

        {!migrationError && (
          <>
            {/* Filters */}
            <form className="flex flex-wrap items-end gap-2 rounded-xl border border-gray-200 bg-white p-3" method="get">
              <div>
                <label className="mb-1 block text-[11px] font-medium text-gray-600">From</label>
                <input type="date" name="from" defaultValue={from} className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium text-gray-600">To</label>
                <input type="date" name="to" defaultValue={to} className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium text-gray-600">Status</label>
                <select name="status" defaultValue={status} className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm">
                  <option value="completed">Completed</option>
                  <option value="voided">Voided</option>
                  <option value="all">All</option>
                </select>
              </div>
              <div className="flex-1 min-w-[180px]">
                <label className="mb-1 block text-[11px] font-medium text-gray-600">Search</label>
                <input type="search" name="q" defaultValue={q} placeholder="Sale # or customer label" className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm" />
              </div>
              <Button type="submit" variant="outline" size="sm">Apply</Button>
              {canWrite && (
                <Link href="/coffee-shop/sales/new" className="ml-auto">
                  <Button type="button" variant="primary" size="sm" className="gap-1.5">
                    <Plus size={12} /> New sale
                  </Button>
                </Link>
              )}
            </form>

            {sales.length === 0 ? (
              <div className="rounded-xl border border-gray-200 bg-white p-12 text-center text-sm text-gray-500">
                No sales match your filters.
              </div>
            ) : (
              <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[760px]">
                    <thead className="border-b border-gray-200 bg-gray-50">
                      <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
                        <th className="px-4 py-2 font-medium">Sale #</th>
                        <th className="px-4 py-2 font-medium">Date</th>
                        <th className="px-4 py-2 font-medium">Customer</th>
                        <th className="px-4 py-2 text-right font-medium">Subtotal</th>
                        <th className="px-4 py-2 text-right font-medium">Discount</th>
                        <th className="px-4 py-2 text-right font-medium">Net</th>
                        <th className="px-4 py-2 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {sales.map((s) => (
                        <tr key={s.id} className={s.status === 'voided' ? 'opacity-60 line-through' : 'hover:bg-gray-50/60'}>
                          <td className="px-4 py-2.5 font-mono text-xs font-semibold">
                            <Link href={`/coffee-shop/sales/${s.id}`} className="text-stone-700 hover:underline">{s.sale_number}</Link>
                          </td>
                          <td className="px-4 py-2.5 text-xs text-gray-700">{format(new Date(s.sale_date + 'T00:00:00'), 'd MMM yyyy')}</td>
                          <td className="px-4 py-2.5 text-gray-700">{s.customer_label ?? <span className="text-gray-400">—</span>}</td>
                          <td className="px-4 py-2.5 text-right font-mono tabular-nums">{formatBDT(Number(s.subtotal))}</td>
                          <td className="px-4 py-2.5 text-right font-mono tabular-nums text-amber-700">
                            {Number(s.discount_amount) > 0 ? `−${formatBDT(Number(s.discount_amount))}` : '—'}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono tabular-nums font-semibold">{formatBDT(Number(s.net_amount))}</td>
                          <td className="px-4 py-2.5">
                            <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${STATUS_BADGE[s.status]}`}>
                              {s.status === 'voided' ? 'Voided' : 'Completed'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
