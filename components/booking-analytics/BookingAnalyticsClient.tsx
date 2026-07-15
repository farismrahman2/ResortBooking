'use client'

import { useRouter } from 'next/navigation'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { DateRangePicker } from '@/components/ui/DateRangePicker'
import { formatBDT } from '@/lib/formatters/currency'
import { formatDate } from '@/lib/formatters/dates'
import type { BookingAnalyticsData } from '@/lib/queries/booking-analytics'

interface Props {
  from:        string
  to:          string
  packageType: 'all' | 'daylong' | 'night'
  data:        BookingAnalyticsData
}

const BOOKING_COLOR = '#047857'  // forest
const QUOTE_COLOR   = '#94a3b8'  // slate
const DOW_COLOR     = '#6366f1'  // indigo
const LEAD_COLOR    = '#f59e0b'  // amber

export function BookingAnalyticsClient({ from, to, packageType, data }: Props) {
  const router = useRouter()

  function pushQuery(next: Partial<{ from: string; to: string; package: string }>) {
    const params = new URLSearchParams()
    params.set('from', next.from ?? from)
    params.set('to',   next.to   ?? to)
    const pkg = next.package ?? packageType
    if (pkg !== 'all') params.set('package', pkg)
    router.push(`/booking-analytics?${params.toString()}`)
  }

  const { totals, bookingsDaily, quotesDaily, dowBreakdown, leadTimeBins, salesReps, corporateBreakdown } = data
  const hasAnyActivity = totals.bookings_created > 0 || totals.quotes_created > 0

  // Merge daily series for the overlay chart, and add a short day label for the x-axis.
  const dailySeries = bookingsDaily.map((row, i) => ({
    date:     row.date,
    day:      new Date(row.date + 'T00:00:00').getDate().toString(),
    bookings: row.count,
    quotes:   quotesDaily[i]?.count ?? 0,
    revenue:  row.revenue,
  }))

  const conversionLabel =
    totals.conversion_rate === null
      ? '—'
      : `${Math.round(totals.conversion_rate * 100)}%`

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Top bar: filters */}
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <DateRangePicker
          from={from}
          to={to}
          onChange={(r) => pushQuery({ from: r.from, to: r.to })}
          presets
        />
        <select
          value={packageType}
          onChange={(e) => pushQuery({ package: e.target.value })}
          className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-forest-500/30"
        >
          <option value="all">All packages</option>
          <option value="daylong">Daylong only</option>
          <option value="night">Night only</option>
        </select>
        <span className="text-xs text-gray-500">
          {formatDate(from)} → {formatDate(to)}
        </span>
      </div>

      <div className="hidden print:block mb-4">
        <h1 className="text-2xl font-bold">Booking Analytics</h1>
        <p className="text-sm text-gray-600">{formatDate(from)} → {formatDate(to)}</p>
      </div>

      {!hasAnyActivity ? (
        <div className="rounded-lg border border-gray-200 bg-white p-12 text-center">
          <p className="text-sm font-medium text-gray-700">No bookings or quotes in this period</p>
          <p className="mt-1 text-xs text-gray-500">Try widening the date range.</p>
        </div>
      ) : (
        <>
          {/* KPI strip */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard label="Bookings Created"  value={totals.bookings_created.toLocaleString()} accent="forest" />
            <KpiCard label="Quotes Created"    value={totals.quotes_created.toLocaleString()}   accent="indigo" />
            <KpiCard label="Conversion Rate"   value={conversionLabel}                          accent="emerald" />
            <KpiCard label="Revenue Locked In" value={formatBDT(totals.revenue)}                accent="forest" />
          </div>

          {/* Daily volume — bookings + quotes overlay */}
          <Section title="📅 Daily Booking Volume">
            <div className="h-72 w-full">
              <ResponsiveContainer>
                <BarChart data={dailySeries} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} stroke="#9ca3af" />
                  <YAxis tick={{ fontSize: 11 }} stroke="#9ca3af" allowDecimals={false} />
                  <Tooltip content={<DailyVolumeTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="quotes"   name="Quotes"   fill={QUOTE_COLOR}   radius={[3, 3, 0, 0]} />
                  <Bar dataKey="bookings" name="Bookings" fill={BOOKING_COLOR} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="mt-2 text-[10px] italic text-gray-400">
              Bucketed by Asia/Dhaka calendar date of <code>created_at</code>. Cancelled bookings/quotes excluded.
            </p>
          </Section>

          {/* Day of week */}
          <Section title="📆 Day-of-Week Pattern">
            <div className="h-64 w-full">
              <ResponsiveContainer>
                <BarChart data={dowBreakdown} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#9ca3af" />
                  <YAxis tick={{ fontSize: 11 }} stroke="#9ca3af" allowDecimals={false} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                  <Bar dataKey="count" name="Bookings" fill={DOW_COLOR} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="mt-2 text-[10px] italic text-gray-400">
              Total bookings created on each weekday across the range. Higher bars = days to staff up for inquiries.
            </p>
          </Section>

          {/* Lead time */}
          <Section title="⏱️ Booking Lead Time">
            <div className="h-64 w-full">
              <ResponsiveContainer>
                <BarChart data={leadTimeBins} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="bin" tick={{ fontSize: 11 }} stroke="#9ca3af" />
                  <YAxis tick={{ fontSize: 11 }} stroke="#9ca3af" allowDecimals={false} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                  <Bar dataKey="count" name="Bookings" fill={LEAD_COLOR} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="mt-2 text-[10px] italic text-gray-400">
              How far in advance customers book (visit_date − created_at). Use this to plan reservation prep windows.
            </p>
          </Section>

          {/* Corporate vs Retail */}
          <Section title="🏢 Corporate vs Retail">
            <CorporateVsRetailCards breakdown={corporateBreakdown} />
            <p className="mt-2 text-[10px] italic text-gray-400">
              Corporate bookings are those marked as such on the quote/booking. Cancelled bookings are excluded.
            </p>
          </Section>

          {/* Sales rep table */}
          {salesReps.length > 0 && (
            <Section title="🧑‍💼 Sales Rep Attribution">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
                    <th className="pb-2 font-medium">Rep</th>
                    <th className="pb-2 text-right font-medium">Bookings</th>
                    <th className="pb-2 text-right font-medium">Revenue</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {salesReps.map((r) => (
                    <tr key={r.rep_id} className="hover:bg-gray-50/60">
                      <td className="py-2 pr-2 font-medium text-gray-800">{r.rep_name}</td>
                      <td className="py-2 px-2 text-right tabular-nums text-gray-700">{r.bookings}</td>
                      <td className="py-2 pl-2 text-right tabular-nums font-medium text-gray-800">{formatBDT(r.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-[10px] italic text-gray-400">
                Only bookings with a sales_employee_id set. Unattributed bookings are excluded from this table but counted in the KPI strip.
              </p>
            </Section>
          )}
        </>
      )}

      {/* Print button */}
      <div className="flex justify-end print:hidden">
        <button
          onClick={() => window.print()}
          className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
        >
          Print / Save as PDF
        </button>
      </div>
    </div>
  )
}

/** Daily Booking Volume tooltip — adds the booked amount (revenue) for the
 *  day alongside the quotes/bookings counts. Recharts injects active/payload. */
function DailyVolumeTooltip({ active, payload }: {
  active?:  boolean
  payload?: Array<{ payload: { date: string; quotes: number; bookings: number; revenue: number } }>
}) {
  if (!active || !payload || payload.length === 0) return null
  const row = payload[0].payload
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-semibold text-gray-900">{formatDate(row.date)}</p>
      <p style={{ color: QUOTE_COLOR }}>Quotes: <span className="font-medium">{row.quotes}</span></p>
      <p style={{ color: BOOKING_COLOR }}>Bookings: <span className="font-medium">{row.bookings}</span></p>
      <p className="mt-1 border-t border-gray-100 pt-1 text-gray-800">
        Amount booked: <span className="font-semibold tabular-nums">{formatBDT(row.revenue)}</span>
      </p>
    </div>
  )
}

function KpiCard({
  label, value, accent,
}: {
  label:  string
  value:  string
  accent: 'forest' | 'emerald' | 'red' | 'indigo'
}) {
  const palette = {
    forest:  'border-forest-200 bg-forest-50 text-forest-800',
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    red:     'border-red-200 bg-red-50 text-red-800',
    indigo:  'border-indigo-200 bg-indigo-50 text-indigo-800',
  }[accent]
  return (
    <div className={`rounded-lg border px-4 py-3 ${palette}`}>
      <p className="text-[10px] font-semibold uppercase tracking-wider opacity-70">{label}</p>
      <p className="mt-1 font-mono text-lg font-bold tabular-nums">{value}</p>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm print:shadow-none print:border-gray-300 print:break-inside-avoid">
      <h2 className="mb-4 text-sm font-semibold text-gray-800">{title}</h2>
      {children}
    </div>
  )
}

function CorporateVsRetailCards({
  breakdown,
}: { breakdown: BookingAnalyticsData['corporateBreakdown'] }) {
  const { corporate, retail } = breakdown
  const totalRevenue  = corporate.revenue  + retail.revenue
  const totalBookings = corporate.bookings + retail.bookings
  if (totalBookings === 0) {
    return <p className="text-sm text-gray-500">No bookings in this period.</p>
  }
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <CvRBucketCard
        label="Corporate"
        sublabel="Marked as corporate on the quote"
        bookings={corporate.bookings}
        revenue={corporate.revenue}
        totalRevenue={totalRevenue}
        totalBookings={totalBookings}
        accent="indigo"
      />
      <CvRBucketCard
        label="Retail"
        sublabel="Individual / leisure guests"
        bookings={retail.bookings}
        revenue={retail.revenue}
        totalRevenue={totalRevenue}
        totalBookings={totalBookings}
        accent="slate"
      />
    </div>
  )
}

function CvRBucketCard({
  label, sublabel, bookings, revenue, totalRevenue, totalBookings, accent,
}: {
  label:         string
  sublabel:      string
  bookings:      number
  revenue:       number
  totalRevenue:  number
  totalBookings: number
  accent:        'slate' | 'indigo'
}) {
  const revenuePct = totalRevenue  > 0 ? (revenue  / totalRevenue)  * 100 : 0
  const countPct   = totalBookings > 0 ? (bookings / totalBookings) * 100 : 0
  const avgTicket  = bookings > 0 ? Math.round(revenue / bookings) : 0
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
        <p className="text-xs font-semibold tabular-nums">{revenuePct.toFixed(1)}% of revenue</p>
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-2 px-4 py-3 text-sm">
        <CvRRow label="Total revenue" value={formatBDT(revenue)} emphasis />
        <CvRRow label="Bookings"      value={`${bookings} (${countPct.toFixed(0)}%)`} />
        <CvRRow label="Avg ticket"    value={formatBDT(avgTicket)} emphasis />
      </div>
    </div>
  )
}

function CvRRow({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2 border-b border-gray-50 py-1 last:border-0">
      <span className="text-xs text-gray-500">{label}</span>
      <span className={`tabular-nums ${emphasis ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>{value}</span>
    </div>
  )
}
