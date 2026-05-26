import { notFound, redirect } from 'next/navigation'
import { Topbar } from '@/components/layout/Topbar'
import { requirePermission } from '@/lib/auth/permissions'
import { getAssetById } from '@/lib/queries/fixed-assets'
import { DisposeAssetForm } from '@/components/fixed-assets/DisposeAssetForm'

export const dynamic = 'force-dynamic'

export default async function DisposeAssetPage({ params }: { params: { id: string } }) {
  await requirePermission('fixed_assets', 'write')
  const asset = await getAssetById(params.id)
  if (!asset) notFound()
  if (asset.status !== 'active') redirect(`/fixed-assets/assets/${asset.id}`)

  return (
    <div className="flex h-full flex-col">
      <Topbar title="Dispose asset" subtitle={`${asset.asset_tag} · ${asset.name}`} />
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        <div className="mx-auto max-w-md">
          <DisposeAssetForm
            assetId={asset.id} assetTag={asset.asset_tag}
            acquisitionCost={Number(asset.acquisition_cost)} salvageValue={Number(asset.salvage_value)}
            usefulLifeYears={asset.useful_life_years} depreciationStartDate={asset.depreciation_start_date}
          />
        </div>
      </div>
    </div>
  )
}
