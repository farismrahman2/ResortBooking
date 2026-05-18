import { Topbar } from '@/components/layout/Topbar'
import { requirePermission } from '@/lib/auth/permissions'
import { getSettings, getRoomInventory } from '@/lib/queries/settings'
import { PropertyForm } from './PropertyForm'

export const dynamic = 'force-dynamic'

export default async function PropertySettingsPage() {
  await requirePermission('settings', 'read')
  const [settings, inventory] = await Promise.all([getSettings(), getRoomInventory()])
  const inventoryTotal = inventory.reduce((s, r) => s + Number(r.total_units ?? 0), 0)
  const currentTotal = settings.total_rooms ?? ''

  return (
    <div className="flex h-full flex-col">
      <Topbar title="Property" subtitle="Resort-wide settings used by reports + occupancy" />
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        <div className="max-w-xl space-y-4">
          <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Total rooms (denominator for occupancy %)</h2>
              <p className="mt-1 text-xs text-gray-500">
                Used by Reports → Operations and the hub's avg occupancy KPI.
                Defaults to the sum of <code>room_inventory.total_units</code> ({inventoryTotal}) if left blank.
              </p>
            </div>
            <PropertyForm currentTotalRooms={currentTotal} inventoryFallback={inventoryTotal} />
          </div>
        </div>
      </div>
    </div>
  )
}
