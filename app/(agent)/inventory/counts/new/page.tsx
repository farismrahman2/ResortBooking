import { Topbar } from '@/components/layout/Topbar'
import { requirePermission } from '@/lib/auth/permissions'
import { listStores, listCategories } from '@/lib/queries/inventory'
import { CountForm } from '@/components/inventory/CountForm'

export const dynamic = 'force-dynamic'

export default async function NewCountPage() {
  await requirePermission('inventory', 'write')
  const [stores, categories] = await Promise.all([listStores(), listCategories()])

  return (
    <div className="flex h-full flex-col">
      <Topbar title="New count" subtitle="Snapshot stock to begin a physical count" />
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        <div className="mx-auto max-w-2xl">
          <CountForm stores={stores} categories={categories} />
        </div>
      </div>
    </div>
  )
}
