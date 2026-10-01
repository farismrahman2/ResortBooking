import { redirect } from 'next/navigation'
import { Topbar } from '@/components/layout/Topbar'
import { RoomBlocksClient } from '@/components/settings/RoomBlocksClient'
import { requirePermission, isAdmin } from '@/lib/auth/permissions'
import { listAllBlocks } from '@/lib/queries/room-blocks'
import { getRoomInventory } from '@/lib/queries/settings'
import { todayDhaka } from '@/lib/dates'

export const dynamic = 'force-dynamic'

export default async function RoomBlocksPage({ searchParams }: { searchParams: { start?: string } }) {
  await requirePermission('settings', 'read')
  if (!(await isAdmin())) redirect('/settings')

  const [{ rows, missing }, inventory] = await Promise.all([listAllBlocks(), getRoomInventory()])
  const today = todayDhaka()
  const start = searchParams.start && /^\d{4}-\d{2}-\d{2}$/.test(searchParams.start) && searchParams.start >= today
    ? searchParams.start : today

  return (
    <div className="flex h-full flex-col">
      <Topbar title="Room blocks" subtitle="Take rooms off sale — maintenance, a building not yet open, a private event" />
      <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
        {missing ? (
          <p className="mx-auto max-w-3xl rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Run <code className="rounded bg-white px-1">migrations/room-blocks/001_room_blocks.sql</code> in Supabase to start blocking rooms.
          </p>
        ) : (
          <RoomBlocksClient blocks={rows} inventory={inventory} today={today} initialStart={start} />
        )}
      </div>
    </div>
  )
}
