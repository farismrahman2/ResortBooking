import { redirect } from 'next/navigation'
import { Topbar } from '@/components/layout/Topbar'
import { PriceGridClient, type GridPackage, type GridRoom } from '@/components/settings/PriceGridClient'
import { getCurrentUserContext } from '@/lib/auth/permissions'
import { canEditPrices, canViewPrices, cellKey } from '@/lib/pricing/price-grid'
import { isWholeDay } from '@/lib/config/rooms'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/** Settings → Room prices: every room type against every package. */
export default async function RoomPricesPage() {
  const ctx = await getCurrentUserContext()
  if (!ctx) redirect('/login')
  const role = ctx.profile.role.slug
  if (!canViewPrices(role)) redirect('/403?from=settings')

  // Read fresh, not from the 5-minute package cache: an editor must see
  // what is stored now, or every save would end in a conflict.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createClient() as any
  const [{ data: pkgs }, { data: inv }, { data: rows }] = await Promise.all([
    db.from('packages').select('id, name, type, is_active, all_year, valid_from, valid_to, display_order')
      .order('is_active', { ascending: false }).order('display_order', { ascending: true }).order('name', { ascending: true }),
    db.from('room_inventory').select('room_type, display_name, daylong_only, display_order').order('display_order', { ascending: true }),
    db.from('package_room_prices').select('package_id, room_type, price'),
  ])

  const packages = ((pkgs ?? []) as GridPackage[]).map((p) => ({ ...p, name: p.name.trim() }))
  // The conference room is priced per day on the quote, not by package.
  const rooms = ((inv ?? []) as Array<GridRoom & { display_order: number }>)
    .filter((r) => !isWholeDay(r.room_type))
    .map(({ room_type, display_name, daylong_only }) => ({ room_type, display_name, daylong_only: !!daylong_only }))
  const prices: Record<string, number> = {}
  for (const r of (rows ?? []) as Array<{ package_id: string; room_type: string; price: number }>) {
    prices[cellKey(r.package_id, r.room_type)] = Number(r.price)
  }

  return (
    <div className="flex h-full flex-col">
      <Topbar title="Room prices" subtitle="Every room type against every package — set and change prices in one place" />
      <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
        <PriceGridClient packages={packages} rooms={rooms} prices={prices} canEdit={canEditPrices(role)} />
      </div>
    </div>
  )
}
