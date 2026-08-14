import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { requirePermission } from '@/lib/auth/permissions'
import { listItemsForTagging, listKitchenVendors } from '@/lib/queries/kitchen'
import { ItemTagger } from '@/components/kitchen/ItemTagger'
import { MigrationErrorBanner } from '@/components/ui/MigrationErrorBanner'

export const dynamic = 'force-dynamic'

export default async function KitchenItemsPage() {
  await requirePermission('kitchen', 'write')
  try {
    const [items, vendors] = await Promise.all([
      listItemsForTagging(),
      listKitchenVendors(),
    ])
    return (
      <div className="flex h-full flex-col">
        <Topbar title="Item vendors" subtitle="Which supplier provides each item" />
        <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
          <div className="mx-auto max-w-4xl space-y-4">
            <Link href="/kitchen/requisitions"
              className="inline-flex items-center gap-1 text-sm text-forest-700 hover:underline">
              <ChevronLeft size={15} /> Back to requisitions
            </Link>
            <ItemTagger items={items} vendors={vendors} />
          </div>
        </div>
      </div>
    )
  } catch (err) {
    return (
      <div className="px-4 py-6">
        <MigrationErrorBanner error={err instanceof Error ? err.message : String(err)} moduleName="Kitchen" migrationPath="migrations/kitchen-module/000_create_requisitions.sql" />
      </div>
    )
  }
}
