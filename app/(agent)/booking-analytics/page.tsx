import dynamic_ from 'next/dynamic'
import { Topbar } from '@/components/layout/Topbar'
import { getBookingAnalytics } from '@/lib/queries/booking-analytics'
import { todayDhaka, monthStartDhaka } from '@/lib/dates'

const BookingAnalyticsClient = dynamic_(
  () => import('@/components/booking-analytics/BookingAnalyticsClient').then((m) => m.BookingAnalyticsClient),
  { loading: () => <div className="p-8 text-sm text-slate-500">Loading charts…</div> },
)

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: { from?: string; to?: string; package?: string }
}

export default async function BookingAnalyticsPage({ searchParams }: PageProps) {
  // Default range: this calendar month (Dhaka), 1st to last day — bookings
  // already made for the rest of the month show as amount booked ahead.
  const today = todayDhaka()
  const defaultFrom = monthStartDhaka(today)
  const [y, m] = today.split('-').map(Number)
  const defaultTo = `${today.slice(0, 7)}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`

  const from = searchParams.from ?? defaultFrom
  const to   = searchParams.to   ?? defaultTo
  const packageType =
    searchParams.package === 'daylong' || searchParams.package === 'night'
      ? searchParams.package
      : 'all'

  const data = await getBookingAnalytics({ from, to, packageType })

  return (
    <div className="flex h-full flex-col">
      <Topbar
        title="Booking Analytics"
        subtitle="When bookings come in — for marketing attribution and staffing prep"
      />
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 print:overflow-visible print:p-0 space-y-6">
        <BookingAnalyticsClient
          from={from}
          to={to}
          packageType={packageType}
          data={data}
        />
      </div>
    </div>
  )
}
