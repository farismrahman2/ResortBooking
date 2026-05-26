import Link from 'next/link'
import { Topbar } from '@/components/layout/Topbar'
import { requirePermission, hasPermission } from '@/lib/auth/permissions'
import { listAssets, listCategories, listLocations } from '@/lib/queries/fixed-assets'
import { MigrationErrorBanner } from '@/components/fixed-assets/MigrationErrorBanner'
import { AssetFilters } from '@/components/fixed-assets/AssetFilters'
import { AssetsTable } from '@/components/fixed-assets/AssetsTable'
import type { AssetStatus, AssetCondition } from '@/lib/supabase/types-fixed-assets'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: { category?: string; location?: string; condition?: string; status?: string; search?: string }
}

export default async function AssetsRegisterPage({ searchParams }: PageProps) {
  await requirePermission('fixed_assets', 'read')
  const canWrite = await hasPermission('fixed_assets', 'write')

  let migrationError: string | null = null
  try {
    const [assets, categories, locations] = await Promise.all([
      listAssets({
        categoryId: searchParams.category,
        locationId: searchParams.location,
        condition:  searchParams.condition as AssetCondition | undefined,
        status:     (searchParams.status as AssetStatus | undefined) || undefined,
        search:     searchParams.search,
        activeOnly: searchParams.status ? false : true,
      }),
      listCategories(),
      listLocations(),
    ])
    return (
      <div className="flex h-full flex-col">
        <Topbar title="Asset Register" subtitle="Every tracked fixed asset"
          action={canWrite ? { label: 'New asset', href: '/fixed-assets/assets/new' } : undefined} />
        <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 space-y-4">
          <AssetFilters categories={categories} locations={locations} />
          <AssetsTable assets={assets} />
          <Link href="/fixed-assets" className="inline-block text-sm text-zinc-700 hover:underline">← Back to Fixed Assets</Link>
        </div>
      </div>
    )
  } catch (err) {
    migrationError = err instanceof Error ? err.message : String(err)
  }
  return (
    <div className="flex h-full flex-col">
      <Topbar title="Asset Register" />
      <div className="px-4 py-6 sm:px-6"><MigrationErrorBanner error={migrationError!} /></div>
    </div>
  )
}
