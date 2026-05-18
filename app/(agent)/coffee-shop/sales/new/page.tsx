import { Topbar } from '@/components/layout/Topbar'
import { requirePermission } from '@/lib/auth/permissions'
import { listChargeCategories, listChargeItems } from '@/lib/queries/charge-catalog'
import { CoffeeShopSaleForm } from '@/components/coffee-shop/CoffeeShopSaleForm'

export const dynamic = 'force-dynamic'

export default async function NewCoffeeShopSalePage() {
  await requirePermission('coffee_shop', 'write')
  const [categories, items] = await Promise.all([
    listChargeCategories({ includeInactive: false }),
    listChargeItems({ includeInactive: false }),
  ])

  return (
    <div className="flex h-full flex-col">
      <Topbar title="New coffee shop sale" subtitle="Walk-in transaction (paid at counter)" />
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        <CoffeeShopSaleForm categories={categories} items={items} />
      </div>
    </div>
  )
}
