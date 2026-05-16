import dynamic_ from 'next/dynamic'
import { Topbar } from '@/components/layout/Topbar'
import { getBookingAnalytics } from '@/lib/queries/booking-analytics'
import { toISODate } from '@/lib/formatters/dates'

const BookingAnalyticsClient = dynamic_(
  () => import('@/components/booking-analytics/BookingAnalyticsClient').then((m) => m.BookingAnalyticsClient),
  { loading: () => <div className="p-8 text-sm text-slate-500">Loading charts…</div> },
)

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: { from?: string; to?: string; package?: string }
}

export default async function BookingAnalyticsPage({ searchParams }: PageProps) {
  // Default range: trailing 30 days ending today. Marketing campaigns are
  // usually evaluated on a rolling window, not a calendar month.
  const now = new Date()
  const defaultTo   = toISODate(now)
  const defaultFromDate = new Date(now)
  defaultFromDate.setDate(defaultFromDate.getDate() - 29)
  const defaultFrom = toISODate(defaultFromDate)

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
