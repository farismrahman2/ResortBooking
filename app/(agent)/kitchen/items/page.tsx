import Link from 'next/link'
import { ChevronLeft, Settings2 } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { requirePermission } from '@/lib/auth/permissions'
import { listItemsForTagging, listKitchenVendors, listItemFormOptions } from '@/lib/queries/kitchen'
import { ItemTagger } from '@/components/kitchen/ItemTagger'
import { MigrationErrorBanner } from '@/components/ui/MigrationErrorBanner'
import { QuickAddItem } from '@/components/kitchen/QuickAddItem'

export const dynamic = 'force-dynamic'

export default async function KitchenItemsPage() {
  await requirePermission('kitchen', 'write')
  try {
    const [items, vendors, opts] = await Promise.all([
      listItemsForTagging(),
      listKitchenVendors(),
      listItemFormOptions(),
    ])
    return (
      <div className="flex h-full flex-col">
        <Topbar title="Item vendors" subtitle="Which supplier provides each item" />
        <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
          <div className="mx-auto max-w-4xl space-y-4">
            <div className="flex items-center justify-between gap-2">
              <Link href="/kitchen/requisitions"
                className="inline-flex items-center gap-1 text-sm text-forest-700 hover:underline">
                <ChevronLeft size={15} /> Back to requisitions
              </Link>
              <Link href="/kitchen/vendors"
                className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 text-xs font-medium text-gray-700">
                <Settings2 size={14} /> Manage vendors
              </Link>
            </div>

            <QuickAddItem vendors={vendors} categories={opts.categories} units={opts.units} />
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
