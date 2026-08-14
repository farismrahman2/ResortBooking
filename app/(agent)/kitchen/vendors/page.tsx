import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { requirePermission } from '@/lib/auth/permissions'
import { listVendorsWithCounts } from '@/lib/queries/kitchen'
import { VendorManager } from '@/components/kitchen/VendorManager'
import { MigrationErrorBanner } from '@/components/ui/MigrationErrorBanner'

export const dynamic = 'force-dynamic'

export default async function KitchenVendorsPage() {
  await requirePermission('kitchen', 'write')
  try {
    const { vendors, counts } = await listVendorsWithCounts()
    return (
      <div className="flex h-full flex-col">
        <Topbar title="Vendors" subtitle="The supplier slots a requisition splits into" />
        <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
          <div className="mx-auto max-w-2xl space-y-4">
            <Link href="/kitchen/items"
              className="inline-flex items-center gap-1 text-sm text-forest-700 hover:underline">
              <ChevronLeft size={15} /> Item vendors
            </Link>
            <VendorManager vendors={vendors} itemCounts={counts} />
          </div>
        </div>
      </div>
    )
  } catch (err) {
    return (
      <div className="px-4 py-6">
        <MigrationErrorBanner error={err instanceof Error ? err.message : String(err)}
          moduleName="Kitchen" migrationPath="migrations/kitchen-module/000_create_requisitions.sql" />
      </div>
    )
  }
}
