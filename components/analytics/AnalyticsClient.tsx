'use client'

import { useRouter } from 'next/navigation'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts'
import { DateRangePicker } from '@/components/ui/DateRangePicker'
import { formatBDT } from '@/lib/formatters/currency'
import { formatDate } from '@/lib/formatters/dates'
import type {
  DailyRevenueRow,
  PackageTypeBreakdown,
  RoomTypeUtilizationRow,
  TotalsSummary,
} from '@/lib/queries/analytics'

interface Props {
  from:     string
  to:       string
  summary:  TotalsSummary
  daily:    DailyRevenueRow[]
  packages: PackageTypeBreakdown
  rooms:    RoomTypeUtilizationRow[]
}

const DAYLONG_COLOR = '#f59e0b'  // amber
const NIGHT_COLOR   = '#6366f1'  // indigo
const TOTAL_COLOR   = '#047857'  // forest
const COLLECT_COLOR = '#10b981'  // emerald
const OUTSTAND_COLOR = '#ef4444' // red

export function AnalyticsClient({ from, to, summary, daily, packages, rooms }: Props) {
  const router = useRouter()

  function updateRange(range: { from: string; to: string }) {
    const params = new URLSearchParams()
    params.set('from', range.from)
    params.set('to', range.to)
    router.push(`/analytics?${params.toString()}`)
  }

  const hasAnyBookings = summary.total_bookings > 0

  // Pie chart data for package breakdown
  const packageData = [
    { name: 'Daylong', value: packages.daylong.total, count: packages.daylong.booking_count },
    { name: 'Night',   value: packages.night.total,   count: packages.night.booking_count },
  ].filter((p) => p.value > 0)

  // Short date labels for x-axis
  const dailyWithShortDate = daily.map((d) => ({
    ...d,
    day: new Date(d.date + 'T00:00:00').getDate().toString(),
  }))

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Top bar: date range picker */}
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <DateRangePicker from={from} to={to} onChange={updateRange} presets />
        <span className="text-xs text-gray-500">
          {formatDate(from)} → {formatDate(to)}
        </span>
      </div>

      {/* Print-only header */}
      <div className="hidden print:block mb-4">
        <h1 className="text-2xl font-bold">Analytics Report</h1>
        <p className="text-sm text-gray-600">{formatDate(from)} → {formatDate(to)}</p>
      </div>

      {!hasAnyBookings ? (
        <div className="rounded-lg border border-gray-200 bg-white p-12 text-center">
          <p className="text-sm font-medium text-gray-700">No bookings in this period</p>
          <p className="mt-1 text-xs text-gray-500">Try widening the date range or selecting a preset.</p>
        </div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard label="Total Revenue" value={formatBDT(summary.total_revenue)} accent="forest" />
            <KpiCard label="Collected"     value={formatBDT(summary.collected)}     accent="emerald" />
            <KpiCard label="Outstanding"   value={formatBDT(summary.outstanding)}   accent="red" />
            <KpiCard label={`Avg per Booking (${summary.total_bookings})`} value={formatBDT(summary.avg_booking_value)} accent="indigo" />
          </div>

          {/* Daily Revenue Trend */}
          <Section title="📈 Daily Revenue Trend">
            <div className="h-72 w-full">
              <ResponsiveContainer>
                <BarChart data={dailyWithShortDate} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} stroke="#9ca3af" />
                  <YAxis tick={{ fontSize: 11 }} stroke="#9ca3af" tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v.toString())} />
                  <Tooltip
                    formatter={(v: number) => formatBDT(v)}
                    labelFormatter={(d, payload) => {
                      const full = payload?.[0]?.payload?.date
                      return full ? formatDate(full) : `Day ${d}`
                    }}
                    contentStyle={{ fontSize: 12, borderRadius: 8 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="total"       name="Total"       fill={TOTAL_COLOR} radius={[3, 3, 0, 0]} />
                  <Bar dataKey="collected"   name="Collected"   fill={COLLECT_COLOR} radius={[3, 3, 0, 0]} />
                  <Bar dataKey="outstanding" name="Outstanding" fill={OUTSTAND_COLOR} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Section>

          {/* Package Type Breakdown */}
          <Section title="🎯 Package Type Breakdown">
            <div className="grid gap-6 lg:grid-cols-2">
              {/* Donut */}
              <div className="h-64">
                {packageData.length === 0 ? (
                  <p className="text-sm text-gray-400 italic text-center pt-20">No package data</p>
                ) : (
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie
                        data={packageData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={55}
                        outerRadius={90}
                        paddingAngle={2}
                        label={(e) => `${e.name}: ${e.count}`}
                      >
                        {packageData.map((entry) => (
                          <Cell key={entry.name} fill={entry.name === 'Daylong' ? DAYLONG_COLOR : NIGHT_COLOR} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v: number) => formatBDT(v)} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>

              {/* Comparison table */}
              <div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
                      <th className="pb-2 font-medium">Type</th>
                      <th className="pb-2 text-right font-medium">Bookings</th>
                      <th className="pb-2 text-right font-medium">Revenue</th>
                      <th className="pb-2 text-right font-medium">Collected</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    <PackageRow color={DAYLONG_COLOR} label="Daylong" stats={packages.daylong} />
                    <PackageRow color={NIGHT_COLOR}   label="Night"   stats={packages.night} />
                  </tbody>
                </table>
              </div>
            </div>
          </Section>

          {/* Room Type Utilization */}
          <Section title="🏨 Room Type Utilization">
            <div className="space-y-4">
              {/* Horizontal bar chart for utilization % */}
              <div className="h-64 w-full">
                <ResponsiveContainer>
                  <BarChart
                    data={rooms}
                    layout="vertical"
                    margin={{ top: 10, right: 20, left: 80, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis type="number" tick={{ fontSize: 11 }} stroke="#9ca3af" unit="%" />
                    <YAxis dataKey="display_name" type="category" tick={{ fontSize: 11 }} stroke="#9ca3af" width={100} />
                    <Tooltip
                      formatter={(v: number, _name, entry) => [
                        `${v}% (${entry.payload?.total_room_nights ?? 0} of ${(entry.payload?.available_inventory ?? 0) * daysInRange(from, to)} room-days)`,
                        'Utilization',
                      ]}
                      contentStyle={{ fontSize: 12, borderRadius: 8 }}
                    />
                    <Bar dataKey="utilization_pct" name="Utilization" fill={TOTAL_COLOR} radius={[0, 3, 3, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Detail table */}
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
                    <th className="py-2 pr-2 font-medium">Room Type</th>
                    <th className="py-2 px-2 text-right font-medium">Qty</th>
                    <th className="py-2 px-2 text-right font-medium">Room-Nights</th>
                    <th className="py-2 px-2 text-right font-medium">Comp</th>
                    <th className="py-2 px-2 text-right font-medium">Revenue</th>
                    <th className="py-2 pl-2 text-right font-medium">Util %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rooms.map((r) => (
                    <tr key={r.room_type} className="hover:bg-gray-50/60">
                      <td className="py-2 pr-2 font-medium text-gray-800">{r.display_name}</td>
                      <td className="py-2 px-2 text-right tabular-nums text-gray-700">{r.total_qty_booked}</td>
                      <td className="py-2 px-2 text-right tabular-nums text-gray-700">{r.total_room_nights}</td>
                      <td className="py-2 px-2 text-right tabular-nums text-emerald-600">{r.comp_count > 0 ? r.comp_count : '—'}</td>
                      <td className="py-2 px-2 text-right tabular-nums font-medium text-gray-800">{formatBDT(r.paid_revenue)}</td>
                      <td className="py-2 pl-2 text-right tabular-nums font-semibold text-forest-700">{r.utilization_pct}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-[10px] text-gray-400 italic">
                Utilization = booked room-nights ÷ (available units × days in range). Comp rooms count toward occupancy but not revenue.
              </p>
            </div>
          </Section>
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

function daysInRange(from: string, to: string) {
  const f = new Date(from + 'T00:00:00')
  const t = new Date(to   + 'T00:00:00')
  return Math.max(1, Math.round((t.getTime() - f.getTime()) / 86400000) + 1)
}

function KpiCard({ label, value, accent }: { label: string; value: string; accent: 'forest' | 'emerald' | 'red' | 'indigo' }) {
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

function PackageRow({ color, label, stats }: { color: string; label: string; stats: { booking_count: number; total: number; collected: number } }) {
  return (
    <tr>
      <td className="py-2">
        <span className="inline-flex items-center gap-2">
          <span className="inline-block h-3 w-3 rounded-full" style={{ background: color }} />
          {label}
        </span>
      </td>
      <td className="py-2 text-right tabular-nums text-gray-700">{stats.booking_count}</td>
      <td className="py-2 text-right tabular-nums font-medium text-gray-800">{formatBDT(stats.total)}</td>
      <td className="py-2 text-right tabular-nums text-emerald-700">{formatBDT(stats.collected)}</td>
    </tr>
  )
}
