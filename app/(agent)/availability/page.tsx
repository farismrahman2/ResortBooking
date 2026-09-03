import { Topbar } from '@/components/layout/Topbar'
import { AvailabilityCalendar } from '@/components/availability/AvailabilityCalendar'
import { getRoomInventory, getSettings } from '@/lib/queries/settings'
import { requirePermission } from '@/lib/auth/permissions'
import { to12Hour } from '@/lib/formatters/whatsapp'

export const dynamic = 'force-dynamic'

export default async function AvailabilityPage() {
  await requirePermission('availability', 'read')
  const [inventory, settings] = await Promise.all([getRoomInventory(), getSettings()])
  const handoverLabel = to12Hour(settings['evening_handover_time'] ?? '18:00')

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
