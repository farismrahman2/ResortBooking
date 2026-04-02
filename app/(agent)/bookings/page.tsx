import { getBookings } from '@/lib/queries/bookings'
import { Topbar } from '@/components/layout/Topbar'
import { BookingsClient } from './BookingsClient'

export const dynamic = 'force-dynamic'

export default async function BookingsPage() {
  const bookings = await getBookings({ limit: 100 })

  return (
    <div className="flex flex-col">
      <Topbar
        title="Bookings"
        subtitle="Track all confirmed reservations"
      />
      <div className="flex flex-col gap-0 p-6">
        <BookingsClient bookings={bookings} />
      </div>
    </div>
  )
}
