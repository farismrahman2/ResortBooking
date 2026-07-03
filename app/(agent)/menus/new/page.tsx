import { Topbar } from '@/components/layout/Topbar'
import { requirePermission } from '@/lib/auth/permissions'
import { listBookingsForMenuPicker, listMenuDays } from '@/lib/queries/menus'
import { NewMenuForm } from '@/components/menus/NewMenuForm'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: { date?: string }
}

export default async function NewMenuPage({ searchParams }: PageProps) {
  await requirePermission('menus', 'write')

  let bookings: Awaited<ReturnType<typeof listBookingsForMenuPicker>> = []
  let recentDays: Awaited<ReturnType<typeof listMenuDays>> = []
  try {
    ;[bookings, recentDays] = await Promise.all([
      listBookingsForMenuPicker(),
      listMenuDays({ limit: 30 }),
    ])
  } catch {
    // unmigrated / bookings unavailable — blank creation still works
  }

  const defaultDate = /^\d{4}-\d{2}-\d{2}$/.test(searchParams.date ?? '') ? searchParams.date : undefined

  return (
    <div className="flex h-full flex-col">
      <Topbar title="New Meal Menu" subtitle="Blank, from a booking, or copied from a previous day" />
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        <div className="mx-auto max-w-lg">
          <NewMenuForm
            bookings={bookings}
            recentDays={recentDays.map((d) => ({
              id: d.id, menu_date: d.menu_date, occasion_note: d.occasion_note, meal_count: d.meal_count,
            }))}
            defaultDate={defaultDate}
          />
        </div>
      </div>
    </div>
  )
}
