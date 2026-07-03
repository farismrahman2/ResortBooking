import { notFound } from 'next/navigation'
import { Topbar } from '@/components/layout/Topbar'
import { requirePermission, hasPermission } from '@/lib/auth/permissions'
import { getMenuDayFull, listMealTypes, getDayMealHeadcounts, type DayMealHeadcounts } from '@/lib/queries/menus'
import { MenuDayEditor } from '@/components/menus/MenuDayEditor'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: { id: string }
  searchParams: { copied?: string }
}

export default async function MenuDayPage({ params, searchParams }: PageProps) {
  const ctx = await requirePermission('menus', 'read')
  const canWrite = await hasPermission('menus', 'write')
  const isAdminUser = ctx.profile.role.slug === 'admin'

  const [day, mealTypes] = await Promise.all([
    getMenuDayFull(params.id),
    listMealTypes(),
  ])
  if (!day) notFound()

  // Day-wide expected headcounts from ALL bookings covering this date —
  // a menu day feeds everyone on site, not one booking's party.
  let dayCounts: DayMealHeadcounts = {}
  try {
    dayCounts = await getDayMealHeadcounts(day.menu_date)
  } catch { /* bookings unavailable — meals start blank */ }

  return (
    <div className="flex h-full flex-col">
      <Topbar title="খাবারের মেনু" subtitle="Meal menu editor" />
      <div className="flex-1 overflow-y-auto">
        <MenuDayEditor
          day={day}
          mealTypes={mealTypes}
          dayCounts={dayCounts}
          canWrite={canWrite}
          isAdmin={isAdminUser}
          justCopied={searchParams.copied === '1'}
        />
      </div>
    </div>
  )
}
