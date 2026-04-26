import Link from 'next/link'
import { Wallet, ArrowDown, ArrowUp, Minus } from 'lucide-react'
import { formatBDT } from '@/lib/formatters/currency'
import { getExpensesThisMonthSummary } from '@/lib/queries/expenses'

export async function ExpensesThisMonth() {
  // Wrapped in try so an unmigrated DB doesn't crash the dashboard.
  let summary: Awaited<ReturnType<typeof getExpensesThisMonthSummary>> | null = null
  try {
    summary = await getExpensesThisMonthSummary()
  } catch {
    return null
  }
  if (!summary) return null

  const { this_month_total, last_month_total, delta, draft_count } = summary
  const direction = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat'
  const Arrow = direction === 'up' ? ArrowUp : direction === 'down' ? ArrowDown : Minus
  // For expenses, "up" is bad, "down" is good
  const deltaColor = direction === 'up' ? 'text-red-600' : direction === 'down' ? 'text-emerald-600' : 'text-gray-500'

  return (
    <Link href="/expenses" className="block rounded-xl border border-rose-200 bg-rose-50 p-5 hover:bg-rose-100/50 transition-colors">
      <div className="flex items-center gap-3 mb-2">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-rose-100">
          <Wallet size={18} className="text-rose-700" />
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-rose-700">Expenses this month</p>
          <p className="font-mono text-lg font-bold text-rose-900 tabular-nums">{formatBDT(this_month_total)}</p>
        </div>
      </div>
      <div className="flex items-center justify-between text-xs">
        <span className={`inline-flex items-center gap-1 font-medium ${deltaColor}`}>
          <Arrow size={12} />
          {delta === 0 ? 'Same as last month' : `${formatBDT(Math.abs(delta))} vs last month`}
        </span>
        {draft_count > 0 && (
          <span className="inline-flex items-center rounded-full bg-amber-100 border border-amber-300 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
            {draft_count} draft{draft_count !== 1 ? 's' : ''}
          </span>
        )}
      </div>
      <p className="mt-1 text-[10px] text-rose-600/70">
        Last month total: <span className="font-mono">{formatBDT(last_month_total)}</span>
      </p>
    </Link>
  )
}
