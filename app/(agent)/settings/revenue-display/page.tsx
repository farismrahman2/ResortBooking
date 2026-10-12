import { Topbar } from '@/components/layout/Topbar'
import { requireRealRevenue } from '@/lib/auth/permissions'
import { listDisplayRules, realMonthRevenue } from '@/lib/queries/revenue-display'
import { adjust, pctForMonth } from '@/lib/revenue/display'
import { todayDhaka } from '@/lib/dates'
import { RevenueDisplayClient, type MonthRow } from '@/components/settings/RevenueDisplayClient'

export const dynamic = 'force-dynamic'

function addMonths(monthStart: string, n: number): string {
  const [y, m] = monthStart.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + n, 1))
  return d.toISOString().slice(0, 10)
}

/** Settings → Revenue display (admin only): the % of real revenue staff see, per month. */
export default async function RevenueDisplayPage() {
  await requireRealRevenue()
  const thisMonth = `${todayDhaka().slice(0, 7)}-01`
  const months = Array.from({ length: 9 }, (_, i) => addMonths(thisMonth, i - 5))   // 5 back, 3 ahead
  const [{ rules, missing }, ...reals] = await Promise.all([
    listDisplayRules(),
    ...months.map((m) => realMonthRevenue(m).catch(() => ({ total: 0, bookings: 0, daily: {} }))),
  ])
  const rows: MonthRow[] = months.map((m, i) => {
    const own = rules.find((r) => r.month === m)
    const pct = pctForMonth(rules, m)
    return { month: m, pct, own: !!own, real: reals[i].total, shown: adjust(reals[i].total, pct), bookings: reals[i].bookings }
  }).reverse()

  return (
    <div className="flex h-full flex-col">
      <Topbar title="Revenue display" subtitle="The revenue figure staff see — a percentage of the real figure, set per month" />
      <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
        {missing ? (
          <p className="mx-auto max-w-3xl rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Run <code className="rounded bg-white px-1">migrations/revenue-display/001_revenue_display.sql</code> in Supabase first.
          </p>
        ) : (
          <RevenueDisplayClient rows={rows} thisMonth={thisMonth} />
        )}
      </div>
    </div>
  )
}
