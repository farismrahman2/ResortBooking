import Link from 'next/link'
import { Plus, Coffee } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { Button } from '@/components/ui/Button'
import { requirePermission, hasPermission } from '@/lib/auth/permissions'
import { listCoffeeShopSales, getDailySummary } from '@/lib/queries/coffee-shop'
import { getTodayInDhaka } from '@/lib/coffee-shop/timezone'
import { MigrationErrorBanner } from '@/components/coffee-shop/MigrationErrorBanner'
import { TodaysSalesTable } from '@/components/coffee-shop/TodaysSalesTable'
import { formatBDT } from '@/lib/formatters/currency'

export const dynamic = 'force-dynamic'

export default async function CoffeeShopHubPage() {
  await requirePermission('coffee_shop', 'read')
  const canWrite = await hasPermission('coffee_shop', 'write')

  const today = getTodayInDhaka()
  let migrationError: string | null = null
  let kpis: Awaited<ReturnType<typeof getDailySummary>> | null = null
  let sales: Awaited<ReturnType<typeof listCoffeeShopSales>> = []
  try {
    [kpis, sales] = await Promise.all([
      getDailySummary(today),
      listCoffeeShopSales({ from_date: today, to_date: today, status: 'all' }),
    ])
  } catch (err) {
    migrationError = err instanceof Error ? err.message : String(err)
  }

  return (
    <div className="flex h-full flex-col">
      <Topbar
        title="Coffee Shop"
        subtitle="Standalone walk-in sales (separate from room extras)"
      />
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 space-y-5">
        {migrationError && <MigrationErrorBanner error={migrationError} />}

        {!migrationError && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-gray-500">Today, {today}</p>
              {canWrite && (
                <Link href="/coffee-shop/sales/new">
                  <Button variant="primary" size="md" className="gap-1.5">
                    <Plus size={14} /> New sale
                  </Button>
                </Link>
              )}
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Kpi label="Sales today" value={String(kpis?.sales_count ?? 0)} />
              <Kpi label="Revenue today" value={formatBDT(kpis?.total_revenue ?? 0)} emphasis />
              <Kpi label="Cash" value={formatBDT(kpis?.cash_total ?? 0)} />
              <Kpi label="Digital" value={formatBDT(kpis?.digital_total ?? 0)} note="bKash + Nagad + Rocket + Card" />
            </div>

            <div className="rounded-xl border border-gray-200 bg-white">
              <div className="flex items-center justify-between border-b border-gray-200 px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <Coffee size={16} className="text-stone-700" />
                  <h3 className="text-sm font-semibold text-gray-900">Today&apos;s sales</h3>
                </div>
                <Link href="/coffee-shop/sales" className="text-xs font-medium text-stone-700 hover:underline">
                  View all sales →
                </Link>
              </div>
              <TodaysSalesTable sales={sales} canWrite={canWrite} />
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function Kpi({ label, value, emphasis, note }: { label: string; value: string; emphasis?: boolean; note?: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${emphasis ? 'text-stone-800' : 'text-gray-900'}`}>{value}</p>
      {note && <p className="mt-0.5 text-[10px] text-gray-400">{note}</p>}
    </div>
  )
}
