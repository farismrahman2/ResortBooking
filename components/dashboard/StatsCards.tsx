import { FileText, CalendarCheck, Wallet, Clock } from 'lucide-react'
import { formatBDT } from '@/lib/formatters/currency'
import { cn } from '@/lib/utils'
import { Sparkline } from '@/components/dashboard/Sparkline'

interface StatsCardsProps {
  quoteStatusCounts: Record<string, number>
  bookingStats: {
    total_bookings: number
    total_revenue: number
    pending_advance: number
  }
  upcomingCount: number
  /** 7-day booking-count trend for the sparkline. */
  trend?: number[]
}

interface StatCardProps {
  label: string
  value: string | number
  icon: React.ReactNode
  iconBg: string
  valueClassName?: string
  trend?: number[]
  trendColor?: string
}

function StatCard({ label, value, icon, iconBg, valueClassName, trend, trendColor }: StatCardProps) {
  return (
    <div className="card flex items-center gap-4 p-5">
      <div className={cn('flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full', iconBg)}>
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className={cn('text-2xl font-bold text-gray-900', valueClassName)}>{value}</p>
        <p className="text-sm text-gray-500">{label}</p>
      </div>
      {trend && trend.length > 1 && (
        <Sparkline points={trend} stroke={trendColor ?? '#16a34a'} className="hidden flex-shrink-0 sm:block" />
      )}
    </div>
  )
}

export function StatsCards({ quoteStatusCounts, bookingStats, upcomingCount, trend }: StatsCardsProps) {
  const totalQuotes = Object.values(quoteStatusCounts).reduce((sum, n) => sum + n, 0)

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <StatCard
        label="Total Quotes"
        value={totalQuotes}
        iconBg="bg-blue-100"
        icon={<FileText size={22} className="text-blue-600" />}
        trend={trend}
        trendColor="#2563eb"
      />
      <StatCard
        label="Active Bookings"
        value={bookingStats.total_bookings}
        iconBg="bg-green-100"
        icon={<CalendarCheck size={22} className="text-green-600" />}
      />
      <StatCard
        label="Pending Advance"
        value={formatBDT(bookingStats.pending_advance)}
        iconBg={bookingStats.pending_advance > 0 ? 'bg-red-100' : 'bg-gray-100'}
        icon={
          <Wallet
            size={22}
            className={bookingStats.pending_advance > 0 ? 'text-red-600' : 'text-gray-500'}
          />
        }
        valueClassName={bookingStats.pending_advance > 0 ? 'text-red-600' : undefined}
      />
      <StatCard
        label="Upcoming This Week"
        value={upcomingCount}
        iconBg="bg-amber-100"
        icon={<Clock size={22} className="text-amber-600" />}
      />
    </div>
  )
}
