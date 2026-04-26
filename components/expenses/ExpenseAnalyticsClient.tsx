'use client'

import { useRouter } from 'next/navigation'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts'
import { DateRangePicker } from '@/components/ui/DateRangePicker'
import { formatBDT } from '@/lib/formatters/currency'
import { formatDate } from '@/lib/formatters/dates'
import { CATEGORY_GROUP_BADGE, PAYEE_TYPE_LABELS } from '@/components/expenses/labels'
import type {
  ExpenseTotalsSummary,
  DailyExpenseTrendRow,
  CategoryBreakdownRow,
  PayeeBreakdownRow,
  ProfitAndLoss,
} from '@/lib/queries/expenses'
import type { ExpenseCategoryGroup } from '@/lib/supabase/types'

interface Props {
  from:       string
  to:         string
  summary:    ExpenseTotalsSummary
  daily:      DailyExpenseTrendRow[]
  categories: CategoryBreakdownRow[]
  payees:     PayeeBreakdownRow[]
  pl:         ProfitAndLoss
}

const ROSE_500    = '#f43f5e'
const EMERALD_500 = '#10b981'
const FOREST_700  = '#15803d'
const RED_500     = '#ef4444'
const AMBER_500   = '#f59e0b'

const GROUP_COLORS: Record<ExpenseCategoryGroup, string> = {
  bazar:         '#f43f5e', // rose
  beverages:     '#0ea5e9', // sky
  utilities:     '#f59e0b', // amber
  maintenance:   '#10b981', // emerald
  salary:        '#6366f1', // indigo
  services:      '#a855f7', // purple
  materials:     '#f97316', // orange
  miscellaneous: '#64748b', // slate
}

export function ExpenseAnalyticsClient({ from, to, summary, daily, categories, payees, pl }: Props) {
  const router = useRouter()

  function updateRange(range: { from: string; to: string }) {
    const params = new URLSearchParams()
    params.set('from', range.from)
    params.set('to',   range.to)
    router.push(`/expenses/analytics?${params.toString()}`)
  }

  const hasAny = summary.txn_count > 0 || pl.revenue.booking_revenue > 0

  // Daily chart with short labels
  const dailyShort = daily.map((d) => ({
    ...d,
    day: new Date(d.date + 'T00:00:00').getDate().toString(),
  }))

  // Top 10 payees for the bar chart
  const topPayees = payees.slice(0, 10)

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Date range */}
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <DateRangePicker from={from} to={to} onChange={updateRange} presets />
        <span className="text-xs text-gray-500">{formatDate(from)} → {formatDate(to)}</span>
      </div>

      {/* Print header */}
      <div className="hidden print:block mb-4">
        <h1 className="text-2xl font-bold">Expense Analytics</h1>
        <p className="text-sm text-gray-600">{formatDate(from)} → {formatDate(to)}</p>
      </div>

      {!hasAny ? (
        <div className="rounded-lg border border-gray-200 bg-white p-12 text-center">
          <p className="text-sm font-medium text-gray-700">No expenses (or revenue) in this period</p>
          <p className="mt-1 text-xs text-gray-500">Try widening the range.</p>
        </div>
      ) : (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard label="Total Expenses"  value={formatBDT(summary.total)}       accent="rose" />
            <KpiCard label="Avg per Day"     value={formatBDT(summary.avg_per_day)} accent="amber" />
            <KpiCard
              label="Top Category"
              value={summary.top_category
                ? `${summary.top_category.name} · ${formatBDT(summary.top_category.amount)}`
                : '—'}
              accent="indigo"
              small
            />
            <KpiCard
              label="Top Payee"
              value={summary.top_payee
                ? `${summary.top_payee.name} · ${formatBDT(summary.top_payee.amount)}`
                : '—'}
              accent="emerald"
              small
            />
          </div>

          {/* Profit & Loss */}
          <Section title="📊 Profit & Loss">
            <PnLPanel pl={pl} />
          </Section>

          {/* Daily expense trend */}
          <Section title="📈 Daily Expense Trend">
            <div className="h-72 w-full">
              <ResponsiveContainer>
                <BarChart data={dailyShort} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
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
                  <Bar dataKey="total" name="Total" fill={ROSE_500} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Section>

          {/* Category breakdown */}
          <Section title="🎯 Category Breakdown">
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="h-64">
                {categories.length === 0 ? (
                  <p className="text-sm text-gray-400 italic text-center pt-20">No category data</p>
                ) : (
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie
                        data={categories}
                        dataKey="total"
                        nameKey="category_name"
                        cx="50%" cy="50%"
                        innerRadius={55} outerRadius={90}
                        paddingAngle={2}
                        label={(e: any) => `${e.pct_of_total}%`}
                      >
                        {categories.map((c) => (
                          <Cell key={c.category_id} fill={GROUP_COLORS[c.category_group] ?? '#9ca3af'} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(v: number) => formatBDT(v)}
                        contentStyle={{ fontSize: 12, borderRadius: 8 }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>

              <div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
                      <th className="pb-2 font-medium">Category</th>
                      <th className="pb-2 text-right font-medium">Txns</th>
                      <th className="pb-2 text-right font-medium">Total</th>
                      <th className="pb-2 text-right font-medium">% of all</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {categories.map((c) => (
                      <tr key={c.category_id} className="hover:bg-gray-50/60">
                        <td className="py-2">
                          <span className="inline-flex items-center gap-1.5">
                            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: GROUP_COLORS[c.category_group] ?? '#9ca3af' }} />
                            <span
                              className={`inline-flex items-center rounded-full border px-1.5 py-0 text-[10px] font-medium ${
                                CATEGORY_GROUP_BADGE[c.category_group]
                              }`}
                            >
                              {c.category_name}
                            </span>
                          </span>
                        </td>
                        <td className="py-2 text-right tabular-nums text-gray-700">{c.txn_count}</td>
                        <td className="py-2 text-right font-mono tabular-nums font-medium text-gray-800">{formatBDT(c.total)}</td>
                        <td className="py-2 text-right tabular-nums text-rose-700 font-semibold">{c.pct_of_total}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </Section>

          {/* Payee breakdown */}
          <Section title="👥 Top Payees">
            <div className="space-y-4">
              {topPayees.length === 0 ? (
                <p className="text-sm text-gray-400 italic">No payees match this range.</p>
              ) : (
                <>
                  <div className="h-64 w-full">
                    <ResponsiveContainer>
                      <BarChart data={topPayees} layout="vertical" margin={{ top: 10, right: 20, left: 80, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis type="number" tick={{ fontSize: 11 }} stroke="#9ca3af" tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v.toString()} />
                        <YAxis dataKey="payee_name" type="category" tick={{ fontSize: 11 }} stroke="#9ca3af" width={110} />
                        <Tooltip formatter={(v: number) => formatBDT(v)} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                        <Bar dataKey="total" name="Total Paid" fill={ROSE_500} radius={[0, 3, 3, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
                        <th className="pb-2 font-medium">Payee</th>
                        <th className="pb-2 font-medium">Type</th>
                        <th className="pb-2 text-right font-medium">Txns</th>
                        <th className="pb-2 text-right font-medium">Total Paid</th>
                        <th className="pb-2 text-right font-medium">Last Paid</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {payees.map((p) => (
                        <tr key={p.payee_id} className="hover:bg-gray-50/60">
                          <td className="py-2 font-medium text-gray-800">{p.payee_name}</td>
                          <td className="py-2 text-xs text-gray-500">{PAYEE_TYPE_LABELS[p.payee_type]}</td>
                          <td className="py-2 text-right tabular-nums text-gray-700">{p.txn_count}</td>
                          <td className="py-2 text-right font-mono tabular-nums font-medium text-gray-800">{formatBDT(p.total)}</td>
                          <td className="py-2 text-right text-xs text-gray-500 tabular-nums">{p.last_paid_date.slice(5)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </div>
          </Section>
        </>
      )}

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

// ─── KPI card ────────────────────────────────────────────────────────────────

function KpiCard({
  label, value, accent, small,
}: {
  label: string
  value: string
  accent: 'rose' | 'emerald' | 'amber' | 'indigo'
  small?: boolean
}) {
  const palette = {
    rose:    'border-rose-200 bg-rose-50 text-rose-800',
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    amber:   'border-amber-200 bg-amber-50 text-amber-800',
    indigo:  'border-indigo-200 bg-indigo-50 text-indigo-800',
  }[accent]
  return (
    <div className={`rounded-lg border px-4 py-3 ${palette}`}>
      <p className="text-[10px] font-semibold uppercase tracking-wider opacity-70">{label}</p>
      <p className={`mt-1 font-mono ${small ? 'text-sm' : 'text-lg'} font-bold tabular-nums truncate`} title={value}>{value}</p>
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

// ─── P&L panel ───────────────────────────────────────────────────────────────

function PnLPanel({ pl }: { pl: ProfitAndLoss }) {
  const grossPositive = pl.profit.gross >= 0
  const cashPositive  = pl.profit.cash_net >= 0

  // Group breakdown sorted descending
  const groupRows = (Object.entries(pl.expenses.by_group) as [ExpenseCategoryGroup, number][])
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* Numbers panel */}
      <div className="space-y-3">
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700">Revenue (Bookings)</p>
          <p className="font-mono text-xl font-bold text-emerald-900 tabular-nums">{formatBDT(pl.revenue.booking_revenue)}</p>
          <div className="mt-1 flex items-center gap-3 text-xs text-emerald-700">
            <span>Collected: <span className="font-mono font-semibold">{formatBDT(pl.revenue.booking_collected)}</span></span>
            <span>Outstanding: <span className="font-mono font-semibold">{formatBDT(pl.revenue.booking_outstanding)}</span></span>
          </div>
        </div>

        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-rose-700">Expenses</p>
          <p className="font-mono text-xl font-bold text-rose-900 tabular-nums">{formatBDT(pl.expenses.total)}</p>
        </div>

        <div className={`rounded-lg border px-4 py-3 ${grossPositive ? 'border-emerald-300 bg-emerald-100' : 'border-red-300 bg-red-50'}`}>
          <p className={`text-[10px] font-semibold uppercase tracking-wider ${grossPositive ? 'text-emerald-800' : 'text-red-800'}`}>Gross Profit (accrual)</p>
          <p className={`font-mono text-2xl font-bold tabular-nums ${grossPositive ? 'text-emerald-900' : 'text-red-900'}`}>
            {grossPositive ? '+' : ''}{formatBDT(pl.profit.gross)}
          </p>
          <p className="text-[10px] text-gray-600 mt-1">Booking revenue (earned) − expenses</p>
        </div>

        <div className={`rounded-lg border px-4 py-3 ${cashPositive ? 'border-amber-300 bg-amber-50' : 'border-red-300 bg-red-50'}`}>
          <p className={`text-[10px] font-semibold uppercase tracking-wider ${cashPositive ? 'text-amber-800' : 'text-red-800'}`}>Cash Net</p>
          <p className={`font-mono text-2xl font-bold tabular-nums ${cashPositive ? 'text-amber-900' : 'text-red-900'}`}>
            {cashPositive ? '+' : ''}{formatBDT(pl.profit.cash_net)}
          </p>
          <p className="text-[10px] text-gray-600 mt-1">Collected advances − expenses (excludes outstanding)</p>
        </div>
      </div>

      {/* Group breakdown */}
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-600 mb-3">Expenses by Group</p>
        {groupRows.length === 0 ? (
          <p className="text-xs text-gray-400 italic">No expenses in this range.</p>
        ) : (
          <div className="space-y-2">
            {groupRows.map(([grp, amt]) => {
              const pct = pl.expenses.total > 0 ? Math.round((amt / pl.expenses.total) * 100) : 0
              return (
                <div key={grp}>
                  <div className="flex items-center justify-between text-xs">
                    <span className="capitalize font-medium text-gray-700">{grp.replace('_', ' ')}</span>
                    <span className="font-mono tabular-nums text-gray-800">{formatBDT(amt)} <span className="text-gray-400">({pct}%)</span></span>
                  </div>
                  <div className="mt-1 h-1.5 w-full rounded-full bg-gray-200 overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${pct}%`, background: GROUP_COLORS[grp] ?? '#9ca3af' }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// Suppress unused imports for tree-shaken constants we may want later
const _unused = [Legend, EMERALD_500, FOREST_700, RED_500, AMBER_500]
void _unused
