import { Topbar } from '@/components/layout/Topbar'
import { requirePermission } from '@/lib/auth/permissions'
import { listBookingsForMenuPicker } from '@/lib/queries/menus'
import { NewMenuForm } from '@/components/menus/NewMenuForm'

export const dynamic = 'force-dynamic'

export default async function NewMenuPage() {
  await requirePermission('menus', 'write')

  let bookings: Awaited<ReturnType<typeof listBookingsForMenuPicker>> = []
  try {
    bookings = await listBookingsForMenuPicker()
  } catch {
    // bookings table unavailable — standalone creation still works
  }

  return (
    <div className="flex h-full flex-col">
      <Topbar title="New Meal Menu" subtitle="Standalone by date, or pre-filled from a booking" />
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        <div className="mx-auto max-w-lg">
          <NewMenuForm bookings={bookings} />
        </div>
      </div>
    </div>
  )
}
