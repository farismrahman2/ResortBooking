import { Topbar } from '@/components/layout/Topbar'
import { requirePermission } from '@/lib/auth/permissions'
import { SupplierForm } from '@/components/inventory/SupplierForm'
import { listKitchenVendors } from '@/lib/queries/kitchen'

export const dynamic = 'force-dynamic'

export default async function NewSupplierPage() {
  await requirePermission('inventory', 'write')
  // Empty when the kitchen module isn't migrated — the field then hides itself.
  const vendors = await listKitchenVendors().catch(() => [])
  return (
    <div className="flex h-full flex-col">
      <Topbar title="New supplier" />
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        <div className="mx-auto max-w-2xl">
          <SupplierForm kitchenVendors={vendors} />
        </div>
      </div>
    </div>
  )
}
