import { Topbar } from '@/components/layout/Topbar'
import { AvailabilityCalendar } from '@/components/availability/AvailabilityCalendar'
import { getRoomInventory } from '@/lib/queries/settings'

export const dynamic = 'force-dynamic'

export default async function AvailabilityPage() {
  const inventory = await getRoomInventory()

  return (
    <div className="flex flex-col">
      <Topbar
        title="Availability"
        subtitle="Check room availability for any date"
      />
      <AvailabilityCalendar inventory={inventory} />
    </div>
  )
}
