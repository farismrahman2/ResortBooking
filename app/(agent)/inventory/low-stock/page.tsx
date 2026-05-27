import Link from 'next/link'
import { Topbar } from '@/components/layout/Topbar'
import { requirePermission } from '@/lib/auth/permissions'
import { getLowStockItems, listSuppliers } from '@/lib/queries/inventory'
import { MigrationErrorBanner } from '@/components/inventory/MigrationErrorBanner'
import { LowStockClient } from '@/components/inventory/LowStockClient'
import type { InvItemWithStock } from '@/lib/supabase/types-inventory'

export const dynamic = 'force-dynamic'

export default async function LowStockPage() {
  await requirePermission('inventory', 'read')

  let migrationError: string | null = null
  let groups: { supplierName: string; items: InvItemWithStock[] }[] = []
  try {
    const [items, suppliers] = await Promise.all([getLowStockItems(), listSuppliers()])
    const nameById = new Map(suppliers.map((s) => [s.id, s.name]))
    const bySupplier = new Map<string, InvItemWithStock[]>()
    for (const it of items) {
      const key = it.default_supplier_id ? (nameById.get(it.default_supplier_id) ?? 'Unassigned') : 'Unassigned'
      const arr = bySupplier.get(key) ?? []
      arr.push(it)
      bySupplier.set(key, arr)
    }
    groups = [...bySupplier.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([supplierName, items]) => ({ supplierName, items }))
  } catch (err) {
    migrationError = err instanceof Error ? err.message : String(err)
  }

  return (
    <div className="flex h-full flex-col">
      <Topbar title="Low Stock" subtitle="Items at or below reorder point, grouped by supplier" />
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 space-y-4">
        {migrationError ? <MigrationErrorBanner error={migrationError} /> : <LowStockClient groups={groups} />}
        <Link href="/inventory" className="inline-block text-sm text-teal-700 hover:underline">← Back to Inventory</Link>
      </div>
    </div>
  )
}
