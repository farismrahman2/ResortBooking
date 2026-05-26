import { notFound } from 'next/navigation'
import { Topbar } from '@/components/layout/Topbar'
import { requirePermission } from '@/lib/auth/permissions'
import { getAssetById, listCategories, listLocations } from '@/lib/queries/fixed-assets'
import { getActivePayees } from '@/lib/queries/expenses'
import { getEmployees } from '@/lib/queries/employees'
import { AssetForm } from '@/components/fixed-assets/AssetForm'

export const dynamic = 'force-dynamic'

export default async function EditAssetPage({ params }: { params: { id: string } }) {
  await requirePermission('fixed_assets', 'write')
  const asset = await getAssetById(params.id)
  if (!asset) notFound()

  const [categories, locations, payees, employees] = await Promise.all([
    listCategories(), listLocations(), getActivePayees(), getEmployees(),
  ])
  const vendors = payees.map((p) => ({ id: p.id, name: p.name }))
  const custodians = employees.filter((e) => e.employment_status === 'active').map((e) => ({ id: e.id, name: e.full_name }))

  return (
    <div className="flex h-full flex-col">
      <Topbar title="Edit asset" subtitle={`${asset.asset_tag} · ${asset.name}`} />
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        <div className="mx-auto max-w-3xl">
          <AssetForm categories={categories} locations={locations} vendors={vendors} custodians={custodians} asset={asset} />
        </div>
      </div>
    </div>
  )
}
