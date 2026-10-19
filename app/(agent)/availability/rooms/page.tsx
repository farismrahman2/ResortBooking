import { Topbar } from '@/components/layout/Topbar'
import { requirePermission } from '@/lib/auth/permissions'
import { getRoomBoard } from '@/lib/queries/room-board'
import { RoomBoardClient } from '@/components/availability/RoomBoardClient'
import { todayDhaka } from '@/lib/dates'

export const dynamic = 'force-dynamic'

/** Availability → Room board: the resort drawn as it stands, by date. */
export default async function RoomBoardPage({ searchParams }: { searchParams: { date?: string } }) {
  await requirePermission('availability', 'read')
  const today = todayDhaka()
  const date = searchParams.date && /^\d{4}-\d{2}-\d{2}$/.test(searchParams.date) ? searchParams.date : today
  const data = await getRoomBoard(date)
  return (
    <div className="flex h-full flex-col">
      <Topbar title="Room board" subtitle="See every room — who is in it, by day and by night" />
      <div className="flex-1 overflow-y-auto px-4 pb-24 sm:px-6">
        <RoomBoardClient data={data} today={today} />
      </div>
    </div>
  )
}
