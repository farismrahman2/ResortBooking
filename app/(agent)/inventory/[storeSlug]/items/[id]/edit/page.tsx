import { notFound } from 'next/navigation'
import { Topbar } from '@/components/layout/Topbar'
import { requirePermission } from '@/lib/auth/permissions'
import { getStoreBySlug, getItemById, listCategories, listUnits, listSuppliers } from '@/lib/queries/inventory'
import { ItemForm } from '@/components/inventory/ItemForm'

export const dynamic = 'force-dynamic'

export default async function EditItemPage({ params }: { params: { storeSlug: string; id: string } }) {
  await requirePermission('inventory', 'write')
  const [store, item] = await Promise.all([
    getStoreBySlug(params.storeSlug),
    getItemById(params.id),
  ])
  if (!store || !item) notFound()

  const [categories, units, suppliers] = await Promise.all([
    listCategories(store.id),
    listUnits(),
    listSuppliers({ active: true }),
  ])

  return (
    <div className="flex h-full flex-col">
      <Topbar title="Edit item" subtitle={`${item.sku_code} · ${item.name}`} />
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        <div className="mx-auto max-w-2xl">
          <ItemForm storeId={store.id} storeSlug={store.slug} categories={categories} units={units} suppliers={suppliers} item={item} />
        </div>
      </div>
    </div>
  )
}
