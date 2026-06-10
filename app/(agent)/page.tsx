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

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  // The reservation role has bookings:write but is scoped to the
  // quote→booking funnel — Dashboard surfaces revenue/expense widgets that
  // they aren't supposed to see. Send them straight to /quotes.
  // Corporate sales has crm:write but no bookings access — land them on /crm
  // instead of falling through to /403.
  const ctx = await getCurrentUserContext()
  if (ctx?.profile.role.slug === 'reservation')     redirect('/quotes')
  if (ctx?.profile.role.slug === 'corporate_sales') redirect('/crm')

  // Dashboard surfaces booking + revenue widgets — gate by bookings:read.
  // Roles without that (e.g. front_desk) get bounced to whatever they can use.
  // ctx is already fetched above — read the permissions map directly rather
  // than six awaited hasPermission() calls.
  const canRead = (m: keyof NonNullable<typeof ctx>['permissions']) =>
    ctx?.permissions[m] === 'read' || ctx?.permissions[m] === 'write'
  if (!canRead('bookings')) {
    if (canRead('checkout'))     redirect('/checkout')
    if (canRead('availability')) redirect('/availability')
    if (canRead('expenses'))     redirect('/expenses')
    if (canRead('hr'))           redirect('/hr')
    if (canRead('settings'))     redirect('/settings')
    redirect('/403?from=dashboard')
  }

  const [recentQuotes, statusCounts, upcomingBookings, bookingStats] = await Promise.all([
    getRecentQuotes(5),
    getQuoteStatusCounts(),
    getUpcomingBookings(5),
    getBookingStats(),
  ])

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
        {/* Stats cards */}
        <StatsCards
          quoteStatusCounts={statusCounts}
          bookingStats={bookingStats}
          upcomingCount={upcomingBookings.length}
        />

        {/* Main content: two column grid */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
          {/* Left: Recent quotes (wider) */}
          <div className="lg:col-span-3 space-y-6">
            <RecentQuotes quotes={recentQuotes} />
          </div>

          {/* Right: Quick actions + revenue + expenses + P&L + upcoming */}
          <div className="lg:col-span-2 space-y-6">
            <QuickActions />
            <RevenueWidget />
            <MonthlyPnLWidget />
            <ExpensesThisMonth />

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
