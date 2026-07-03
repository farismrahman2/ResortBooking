import { notFound } from 'next/navigation'
import { Topbar } from '@/components/layout/Topbar'
import { requirePermission, hasPermission } from '@/lib/auth/permissions'
import { getMenuDayFull, listMealTypes, getBookingPrefill } from '@/lib/queries/menus'
import { MenuDayEditor } from '@/components/menus/MenuDayEditor'
import type { MenuBookingPrefill } from '@/lib/supabase/types-menus'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: { id: string }
}

export default async function MenuDayPage({ params }: PageProps) {
  const ctx = await requirePermission('menus', 'read')
  const canWrite = await hasPermission('menus', 'write')
  const isAdminUser = ctx.profile.role.slug === 'admin'

  const [day, mealTypes] = await Promise.all([
    getMenuDayFull(params.id),
    listMealTypes(),
  ])
  if (!day) notFound()

  // Guest-count defaults for new meals when this menu came from a booking
  let prefill: MenuBookingPrefill | null = null
  if (day.booking_id) {
    try {
      prefill = await getBookingPrefill(day.booking_id)
    } catch { /* booking gone or unconfirmed — no defaults */ }
  }

  return (
    <div className="flex h-full flex-col">
      <Topbar title="খাবারের মেনু" subtitle="Meal menu editor" />
      <div className="flex-1 overflow-y-auto">
        <MenuDayEditor
          day={day}
          mealTypes={mealTypes}
          prefill={prefill}
          canWrite={canWrite}
          isAdmin={isAdminUser}
        />
      </div>
    </div>
  )
}
