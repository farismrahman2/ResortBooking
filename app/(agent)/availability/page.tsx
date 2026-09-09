import { Topbar } from '@/components/layout/Topbar'
import { AvailabilityCalendar } from '@/components/availability/AvailabilityCalendar'
import { getRoomInventory, getSettings } from '@/lib/queries/settings'
import { requirePermission } from '@/lib/auth/permissions'
import { internalHandoverLabel } from '@/lib/settings/handover'

export const dynamic = 'force-dynamic'

export default async function AvailabilityPage() {
  await requirePermission('availability', 'read')
  const [inventory, settings] = await Promise.all([getRoomInventory(), getSettings()])
  const handoverLabel = internalHandoverLabel(settings)

  return (
    <div className="flex flex-col">
      <Topbar
        title="Availability"
        subtitle="Check room availability for any date"
      />
      <AvailabilityCalendar inventory={inventory} handoverLabel={handoverLabel} />
    </div>
  )
}
