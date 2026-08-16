import { getBookings } from '@/lib/queries/bookings'
import { Topbar } from '@/components/layout/Topbar'
import { BookingsClient } from './BookingsClient'

export const dynamic = 'force-dynamic'

export default async function BookingsPage() {
  // Newest first + an explicit cap: unbounded, PostgREST silently truncates at
  // 1000 rows, and with the old ascending order that meant the 1000 OLDEST
  // bookings — newly created bookings stopped appearing in this list at all.
  // Descending keeps every recent and upcoming booking; only deep history
  // falls off the end once the resort has 1000+ bookings.
  const bookings = await getBookings({ order: 'desc', limit: 1000 })

  return (
    <div className="flex flex-col">
      <Topbar
        title="Bookings"
        subtitle="Track all confirmed reservations"
      />
      <div className="flex flex-col gap-0 p-4 sm:p-6">
        <BookingsClient bookings={bookings} />
      </div>
    </div>
  )
}
