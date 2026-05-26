import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Topbar } from '@/components/layout/Topbar'
import { requirePermission, hasPermission } from '@/lib/auth/permissions'
import { getStoreBySlug, listItems, listCategories, listSuppliers } from '@/lib/queries/inventory'
import { MigrationErrorBanner } from '@/components/inventory/MigrationErrorBanner'
import { ItemFilters } from '@/components/inventory/ItemFilters'
import { ItemsTable } from '@/components/inventory/ItemsTable'

export const dynamic = 'force-dynamic'

interface PageProps {
  params:       { storeSlug: string }
  searchParams: { category?: string; supplier?: string; search?: string; low?: string }
}

export default async function StoreOverviewPage({ params, searchParams }: PageProps) {
  await requirePermission('inventory', 'read')
  const canWrite = await hasPermission('inventory', 'write')

  let migrationError: string | null = null
  try {
    const store = await getStoreBySlug(params.storeSlug)
    if (!store) notFound()

    const [items, categories, suppliers] = await Promise.all([
      listItems({
        storeId:      store.id,
        categoryId:   searchParams.category,
        supplierId:   searchParams.supplier,
        search:       searchParams.search,
        lowStockOnly: searchParams.low === '1',
        activeOnly:   true,
      }),
      listCategories(store.id),
      listSuppliers({ active: true }),
    ])

    return (
      <div className="flex h-full flex-col">
        <Topbar
          title={store.display_name}
          subtitle={store.description ?? undefined}
          action={canWrite ? { label: 'New item', href: `/inventory/${store.slug}/items/new` } : undefined}
        />
        <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 space-y-4">
          <ItemFilters categories={categories} suppliers={suppliers} />
          <ItemsTable items={items} storeSlug={store.slug} />
        </div>
      </div>
    )
  } catch (err) {
    // notFound() throws a special error we must rethrow
    if (err && typeof err === 'object' && 'digest' in err && String((err as { digest?: string }).digest).startsWith('NEXT_')) throw err
    migrationError = err instanceof Error ? err.message : String(err)
  }

  return (
    <div className="flex h-full flex-col">
      <Topbar title="Inventory" />
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        <MigrationErrorBanner error={migrationError!} />
        <p className="mt-4 text-sm">
          <Link href="/inventory" className="text-teal-700 hover:underline">← Back to Inventory</Link>
        </p>
      </div>
    </div>
  )
}
