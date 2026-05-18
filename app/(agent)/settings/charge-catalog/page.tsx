import { Topbar } from '@/components/layout/Topbar'
import { ChargeCatalogClient } from '@/components/checkout/ChargeCatalogClient'
import { MigrationErrorBanner } from '@/components/checkout/MigrationErrorBanner'
import { listChargeCategories, listChargeItems } from '@/lib/queries/charge-catalog'
import { requirePermission } from '@/lib/auth/permissions'

export const dynamic = 'force-dynamic'

export default async function ChargeCatalogPage() {
  await requirePermission('settings', 'read')

  let migrationError: string | null = null
  let categories: Awaited<ReturnType<typeof listChargeCategories>> = []
  let items: Awaited<ReturnType<typeof listChargeItems>> = []
  try {
    [categories, items] = await Promise.all([
      listChargeCategories({ includeInactive: true }),
      listChargeItems({ includeInactive: true }),
    ])
  } catch (err) {
    migrationError = err instanceof Error ? err.message : String(err)
  }

  return (
    <div className="flex h-full flex-col">
      <Topbar title="Charge Catalog" subtitle="Restaurant menu, damage rates, and miscellaneous charges" />
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        <div className="mx-auto max-w-3xl space-y-4">
          {migrationError && <MigrationErrorBanner error={migrationError} />}
          {!migrationError && <ChargeCatalogClient categories={categories} items={items} />}
        </div>
      </div>
    </div>
  )
}
