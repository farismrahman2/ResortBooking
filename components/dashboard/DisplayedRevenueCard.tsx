import Link from 'next/link'
import { TrendingUp } from 'lucide-react'
import { formatBDT } from '@/lib/formatters/currency'
import { todayDhaka } from '@/lib/dates'
import { getDisplayedRevenue, listDisplayRules } from '@/lib/queries/revenue-display'
import { pctForMonth } from '@/lib/revenue/display'

/**
 * "Revenue this month" for everyone but the admin — the ADJUSTED figure
 * (lib/revenue/display.ts). A server component: only adjusted numbers are
 * rendered, the real total never reaches the browser. With `adminNote`, the
 * admin sees what staff see and the % in force.
 */
export async function DisplayedRevenueCard({ adminNote = false }: { adminNote?: boolean }) {
  const today = todayDhaka()
  const [shown, rules] = await Promise.all([
    getDisplayedRevenue(today),
    adminNote ? listDisplayRules().then((r) => r.rules) : Promise.resolve([]),
  ])
  const monthLabel = new Date(`${shown.month}T00:00:00`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
  const max = Math.max(1, ...shown.daily.map((d) => d.amount))
  const soFar = shown.daily.filter((d) => d.date <= today).reduce((s, d) => s + d.amount, 0)

  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{adminNote ? 'Staff see — revenue this month' : 'Revenue this month'}</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">{formatBDT(shown.total)}</p>
          <p className="mt-0.5 text-xs text-gray-500">{monthLabel} · {shown.bookings} booking{shown.bookings === 1 ? '' : 's'} · {formatBDT(soFar)} up to today</p>
        </div>
        <div className="rounded-lg bg-forest-50 p-2 text-forest-700"><TrendingUp size={18} /></div>
      </div>
      {/* One bar per day of the month; future days are bookings already made. */}
      <div className="mt-4 flex h-14 items-end gap-[2px]" aria-hidden>
        {shown.daily.map((d) => (
          <div key={d.date} title={`${d.date}: ${formatBDT(d.amount)}`}
            className={`flex-1 rounded-sm ${d.date <= today ? 'bg-forest-500' : 'bg-forest-200'}`}
            style={{ height: `${Math.max(d.amount > 0 ? 6 : 2, (d.amount / max) * 100)}%` }} />
        ))}
      </div>
      {adminNote && (
        <p className="mt-3 text-xs text-gray-500">
          Shown to staff at <b className="text-gray-800">{pctForMonth(rules, shown.month)}%</b> of actual.{' '}
          <Link href="/settings/revenue-display" className="font-medium text-forest-700 hover:underline">Change</Link>
        </p>
      )}
    </div>
  )
}
