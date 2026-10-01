import { Topbar } from '@/components/layout/Topbar'
import { AvailabilityCalendar } from '@/components/availability/AvailabilityCalendar'
import { getRoomInventory, getSettings } from '@/lib/queries/settings'
import Link from 'next/link'
import { Ban } from 'lucide-react'
import { requirePermission, isAdmin } from '@/lib/auth/permissions'
import { internalHandoverLabel } from '@/lib/settings/handover'

export const dynamic = 'force-dynamic'

export default async function AvailabilityPage() {
  await requirePermission('availability', 'read')
  const [inventory, settings, admin] = await Promise.all([getRoomInventory(), getSettings(), isAdmin()])
  const handoverLabel = internalHandoverLabel(settings)

  return (
    <div className="flex flex-col">
      <Topbar
        title="Availability"
        subtitle="Check room availability for any date"
      />
      {admin && (
        <div className="px-4 pt-4 sm:px-6">
          <Link href="/settings/room-blocks"
            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 text-xs font-medium text-gray-700 hover:border-forest-400">
            <Ban size={13} /> Block rooms
          </Link>
        </div>
      )}
      <AvailabilityCalendar inventory={inventory} handoverLabel={handoverLabel} />
    </div>
  )
}
