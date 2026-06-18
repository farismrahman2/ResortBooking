import { formatBDT } from '@/lib/formatters/currency'
import type { DowRow } from '@/lib/queries/reports/income'

interface Props {
  rows: DowRow[]
}

interface Bucket {
  total_revenue:     number
  bookings:          number
  days_in_period:    number
  avg_occupancy_sum: number   // weighted by days, divided at the end
}

function emptyBucket(): Bucket {
  return { total_revenue: 0, bookings: 0, days_in_period: 0, avg_occupancy_sum: 0 }
}

/** Bangladesh standard: Fri + Sat are the weekend, Sun-Thu the working week.
 *  Hard-coded — if the property ever opens locations on different schedules,
 *  this becomes a setting. */
const WEEKEND_DOWS = new Set([5, 6])  // 0 = Sunday … 6 = Saturday

export function WeekdayWeekendSummary({ rows }: Props) {
  const weekday = emptyBucket()
  const weekend = emptyBucket()
  for (const r of rows) {
    const bucket = WEEKEND_DOWS.has(r.dow) ? weekend : weekday
    bucket.total_revenue     += r.total_revenue
    bucket.bookings          += r.bookings
    bucket.days_in_period    += r.days_in_period
    // Per-row avg_occupancy_pct is already an average per day; weight by
    // days_in_period when rolling up so a week with one Tuesday doesn't
    // count equal to a week with five.
    bucket.avg_occupancy_sum += r.avg_occupancy_pct * r.days_in_period
  }

  const totalRevenue = weekday.total_revenue + weekend.total_revenue
  if (totalRevenue === 0 && weekday.bookings === 0 && weekend.bookings === 0) {
    return null
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <BucketCard
        label="Weekday"
        sublabel="Sun – Thu"
        bucket={weekday}
        totalRevenue={totalRevenue}
        accent="slate"
      />
      <BucketCard
        label="Weekend"
        sublabel="Fri – Sat"
        bucket={weekend}
        totalRevenue={totalRevenue}
        accent="indigo"
      />
    </div>
  )
}

function BucketCard({
  label, sublabel, bucket, totalRevenue, accent,
}: {
  label:        string
  sublabel:     string
  bucket:       Bucket
  totalRevenue: number
  accent:       'slate' | 'indigo'
}) {
  const pct          = totalRevenue > 0 ? (bucket.total_revenue / totalRevenue) * 100 : 0
  const avgPerDay    = bucket.days_in_period > 0 ? Math.round(bucket.total_revenue / bucket.days_in_period) : 0
  const avgPerBkg    = bucket.bookings > 0 ? Math.round(bucket.total_revenue / bucket.bookings) : 0
  const avgOccupancy = bucket.days_in_period > 0
    ? Math.round((bucket.avg_occupancy_sum / bucket.days_in_period) * 10) / 10
    : 0

  const headerTone = accent === 'indigo'
    ? 'bg-indigo-50 text-indigo-800 border-indigo-200'
    : 'bg-slate-100 text-slate-700 border-slate-200'

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <div className={`flex items-baseline justify-between border-b px-4 py-2.5 ${headerTone}`}>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide">{label}</p>
          <p className="text-[10px] opacity-75">{sublabel}</p>
        </div>
        <p className="text-xs font-semibold tabular-nums">{pct.toFixed(1)}% of revenue</p>
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-2 px-4 py-3 text-sm">
        <Row label="Total revenue"  value={formatBDT(bucket.total_revenue)} emphasis />
        <Row label="Bookings"       value={String(bucket.bookings)} />
        <Row label="Avg / day"      value={formatBDT(avgPerDay)} emphasis />
        <Row label="Avg / booking"  value={formatBDT(avgPerBkg)} />
        <Row label="Days in period" value={String(bucket.days_in_period)} />
        <Row label="Avg occupancy"  value={`${avgOccupancy.toFixed(1)}%`} />
      </div>
    </div>
  )
}

function Row({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2 border-b border-gray-50 py-1 last:border-0">
      <span className="text-xs text-gray-500">{label}</span>
      <span className={`tabular-nums ${emphasis ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>{value}</span>
    </div>
  )
}
