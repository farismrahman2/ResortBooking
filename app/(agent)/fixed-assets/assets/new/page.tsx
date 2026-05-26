import { Topbar } from '@/components/layout/Topbar'
import { requirePermission } from '@/lib/auth/permissions'
import { listCategories, listLocations } from '@/lib/queries/fixed-assets'
import { getActivePayees } from '@/lib/queries/expenses'
import { getEmployees } from '@/lib/queries/employees'
import { AssetForm } from '@/components/fixed-assets/AssetForm'

export const dynamic = 'force-dynamic'

export default async function NewAssetPage() {
  await requirePermission('fixed_assets', 'write')
  const [categories, locations, payees, employees] = await Promise.all([
    listCategories(), listLocations(), getActivePayees(), getEmployees(),
  ])
  const vendors = payees.map((p) => ({ id: p.id, name: p.name }))
  const custodians = employees
    .filter((e) => e.employment_status === 'active')
    .map((e) => ({ id: e.id, name: e.full_name }))

  return (
    <div className="flex h-full flex-col">
      <Topbar title="New asset" subtitle="Add to the asset register" />
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        <div className="mx-auto max-w-3xl">
          <AssetForm categories={categories} locations={locations} vendors={vendors} custodians={custodians} />
        </div>
      </div>
    </div>
  )
}
