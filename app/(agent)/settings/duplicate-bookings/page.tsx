import { Topbar } from '@/components/layout/Topbar'
import { DuplicateBookingsTable } from '@/components/settings/DuplicateBookingsTable'
import { findAllDuplicateGroups } from '@/lib/queries/duplicate-bookings'
import { requirePermission, hasPermission } from '@/lib/auth/permissions'

export const dynamic = 'force-dynamic'

export default async function DuplicateBookingsPage() {
  await requirePermission('settings', 'read')
  const [groups, canWrite] = await Promise.all([
    findAllDuplicateGroups(),
    hasPermission('settings', 'write'),
  ])

  return (
    <div className="flex h-full flex-col">
      <Topbar
        title="Duplicate Bookings"
        subtitle="Bookings that share the same guest phone, visit date, and package type"
      />
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        <div className="mx-auto max-w-4xl space-y-4">
          <DuplicateBookingsTable groups={groups} canWrite={canWrite} />
        </div>
      </div>
    </div>
  )
}
