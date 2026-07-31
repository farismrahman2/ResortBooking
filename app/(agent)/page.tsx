import { redirect } from 'next/navigation'
import { getRecentQuotes, getQuoteStatusCounts } from '@/lib/queries/quotes'
import { getUpcomingBookings, getBookingStats } from '@/lib/queries/bookings'
import { Topbar } from '@/components/layout/Topbar'
import { StatsCards } from '@/components/dashboard/StatsCards'
import { RecentQuotes } from '@/components/dashboard/RecentQuotes'
import { QuickActions } from '@/components/dashboard/QuickActions'
import { RevenueWidget } from '@/components/dashboard/RevenueWidget'
import { ExpensesThisMonth } from '@/components/dashboard/ExpensesThisMonth'
import { MonthlyPnLWidget } from '@/components/dashboard/MonthlyPnLWidget'
import { getCurrentUserContext } from '@/lib/auth/permissions'
import { formatDate } from '@/lib/formatters/dates'
import { formatBDT } from '@/lib/formatters/currency'
import Link from 'next/link'
import { TodayPanel } from '@/components/dashboard/TodayPanel'
import { getTodaySnapshot } from '@/lib/queries/dashboard-today'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  // The reservation role has bookings:write but is scoped to the
  // quote→booking funnel — Dashboard surfaces revenue/expense widgets that
  // they aren't supposed to see. Send them straight to /quotes.
  // Corporate sales has crm:write but no bookings access — land them on /crm
  // instead of falling through to /403.
  const ctx = await getCurrentUserContext()
  // Corporate sales has no bookings access at all — "today at the resort"
  // would be meaningless to them. Review collectors only have Guest Feedback.
  if (ctx?.profile.role.slug === 'corporate_sales')  redirect('/crm')
  if (ctx?.profile.role.slug === 'review_collector') redirect('/qa')

  const canRead = (m: keyof NonNullable<typeof ctx>['permissions']) =>
    ctx?.permissions[m] === 'read' || ctx?.permissions[m] === 'write'

  // Front desk and reservations used to get bounced off the dashboard
  // entirely. They have checkout/bookings access and arrivals-departures is
  // precisely their job, so they now get the operational half of this page —
  // just without the revenue widgets below.
  const canSeeOps     = canRead('bookings') || canRead('checkout')
  const canSeeRevenue = canRead('reports') || canRead('expenses')

  if (!canSeeOps) {
    if (canRead('availability')) redirect('/availability')
    if (canRead('expenses'))     redirect('/expenses')
    if (canRead('hr'))           redirect('/hr')
    if (canRead('qa'))           redirect('/qa')
    if (canRead('settings'))     redirect('/settings')
    redirect('/403?from=dashboard')
  }

  const today = await getTodaySnapshot().catch(() => null)

  // Booking-module widgets are a separate gate from the operational panel:
  // front desk sees today's arrivals but not the quote funnel.
  const showBookingWidgets = canRead('bookings')
  const [recentQuotes, statusCounts, upcomingBookings, bookingStats] = showBookingWidgets
    ? await Promise.all([
        getRecentQuotes(5),
        getQuoteStatusCounts(),
        getUpcomingBookings(5),
        getBookingStats(),
      ])
    : [[], { draft: 0, sent: 0, confirmed: 0, cancelled: 0 } as any, [], { total_bookings: 0, total_revenue: 0, pending_advance: 0 }]

  const subtitle = new Date().toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  return (
    <div className="flex flex-col">
      <Topbar title="Dashboard" subtitle={subtitle} />

      <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
        {/* What's happening today — the question this page is actually opened
            to answer. Shown to everyone with operational access. */}
        {today && <TodayPanel snapshot={today} name={ctx?.profile.full_name} />}

        {showBookingWidgets && (
          <StatsCards
            quoteStatusCounts={statusCounts}
            bookingStats={bookingStats}
            upcomingCount={upcomingBookings.length}
            trend={today?.bookingTrend.map((t) => t.count)}
          />
        )}

        {/* Main content: two column grid */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
          {/* Left: Recent quotes (wider) */}
          <div className="lg:col-span-3 space-y-6">
            {showBookingWidgets && <RecentQuotes quotes={recentQuotes} />}
          </div>

          {/* Right: Quick actions + revenue + expenses + P&L + upcoming */}
          <div className="lg:col-span-2 space-y-6">
            <QuickActions />
            {canSeeRevenue && <RevenueWidget />}
            {canSeeRevenue && <MonthlyPnLWidget />}
            {canSeeRevenue && <ExpensesThisMonth />}

            {/* Upcoming bookings mini list */}
            <div className="card p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-semibold text-gray-900">Upcoming Bookings</h3>
                <Link
                  href="/bookings"
                  className="text-sm text-forest-700 hover:text-forest-800 hover:underline font-medium"
                >
                  View All
                </Link>
              </div>

              {upcomingBookings.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">No upcoming bookings</p>
              ) : (
                <div className="space-y-2">
                  {upcomingBookings.map((booking) => (
                    <div
                      key={booking.id}
                      className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2.5 text-sm"
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900 truncate">{booking.customer_name}</p>
                        <p className="text-xs text-gray-500">{formatDate(booking.visit_date)}</p>
                      </div>
                      <div className="text-right flex-shrink-0 ml-2">
                        <p className="text-xs font-mono font-medium text-gray-700">
                          {formatBDT(booking.total)}
                        </p>
                        <p className="text-xs text-gray-400">{booking.adults}A</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
