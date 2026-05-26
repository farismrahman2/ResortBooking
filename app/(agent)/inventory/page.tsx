import { Topbar } from '@/components/layout/Topbar'
import Link from 'next/link'
import { Boxes, Users } from 'lucide-react'
import { requirePermission } from '@/lib/auth/permissions'
import { listStores, listItems, getInventoryHubKpis } from '@/lib/queries/inventory'
import { MigrationErrorBanner } from '@/components/inventory/MigrationErrorBanner'
import { StoreCard } from '@/components/inventory/StoreCard'
import { formatBDT } from '@/lib/formatters/currency'

export const dynamic = 'force-dynamic'

export default async function InventoryHubPage() {
  await requirePermission('inventory', 'read')

  let migrationError: string | null = null
  let stores: Awaited<ReturnType<typeof listStores>> = []
  let kpis: Awaited<ReturnType<typeof getInventoryHubKpis>> | null = null
  const perStore: Record<string, { skus: number; low: number }> = {}

  try {
    stores = await listStores()
    kpis = await getInventoryHubKpis()
    const allItems = await listItems({ activeOnly: true })
    for (const s of stores) perStore[s.id] = { skus: 0, low: 0 }
    for (const it of allItems) {
      const bucket = perStore[it.store_id]
      if (!bucket) continue
      bucket.skus += 1
      if (it.isBelowReorder) bucket.low += 1
    }
  } catch (err) {
    migrationError = err instanceof Error ? err.message : String(err)
  }

  return (
    <div className="flex h-full flex-col">
      <Topbar title="Inventory" subtitle="Housekeeping & kitchen stores" />
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 space-y-5">
        {migrationError && <MigrationErrorBanner error={migrationError} />}

        {!migrationError && (
          <>
            <div className="flex items-center justify-end">
              <Link href="/inventory/suppliers" className="inline-flex items-center gap-1.5 text-sm font-medium text-teal-700 hover:underline">
                <Users size={14} /> Suppliers
              </Link>
            </div>

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Kpi label="Active SKUs" value={String(kpis?.total_skus ?? 0)} />
              <Kpi label="Below reorder" value={String(kpis?.below_reorder ?? 0)} danger={!!kpis?.below_reorder} />
              <Kpi label="Below par" value={String(kpis?.below_par ?? 0)} />
              <Kpi label="Stock value" value={formatBDT(kpis?.stock_value ?? 0)} emphasis />
            </div>

            <div>
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-900">
                <Boxes size={16} className="text-teal-700" /> Stores
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {stores.map((s) => (
                  <StoreCard
                    key={s.id}
                    store={s}
                    skuCount={perStore[s.id]?.skus ?? 0}
                    lowStock={perStore[s.id]?.low ?? 0}
                  />
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function Kpi({ label, value, emphasis, danger }: { label: string; value: string; emphasis?: boolean; danger?: boolean }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${danger ? 'text-red-700' : emphasis ? 'text-teal-800' : 'text-gray-900'}`}>{value}</p>
    </div>
  )
}
