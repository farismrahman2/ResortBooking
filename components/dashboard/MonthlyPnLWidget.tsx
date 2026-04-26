import Link from 'next/link'
import { TrendingUp, TrendingDown, Minus, BarChart3 } from 'lucide-react'
import { formatBDT } from '@/lib/formatters/currency'
import { getProfitAndLoss } from '@/lib/queries/expenses'
import { toISODate } from '@/lib/formatters/dates'

export async function MonthlyPnLWidget() {
  // Wrap in try in case migrations haven't been run yet
  let pl: Awaited<ReturnType<typeof getProfitAndLoss>> | null = null
  try {
    const now = new Date()
    const from = toISODate(new Date(now.getFullYear(), now.getMonth(), 1))
    const to   = toISODate(new Date(now.getFullYear(), now.getMonth() + 1, 0))
    pl = await getProfitAndLoss(from, to)
  } catch {
    return null
  }
  if (!pl) return null

  const grossPositive = pl.profit.gross >= 0
  const Arrow = pl.profit.gross > 0 ? TrendingUp : pl.profit.gross < 0 ? TrendingDown : Minus
  const arrowColor = grossPositive ? 'text-emerald-600' : 'text-red-600'

  return (
    <Link href="/expenses/analytics" className="block rounded-xl border border-gray-200 bg-white p-5 hover:bg-gray-50 transition-colors">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100">
            <BarChart3 size={16} className="text-indigo-700" />
          </div>
          <h3 className="text-sm font-semibold text-gray-800">This Month — P&amp;L</h3>
        </div>
        <Arrow size={18} className={arrowColor} />
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-gray-500">Revenue</p>
          <p className="font-mono text-sm font-bold text-emerald-700 tabular-nums">{formatBDT(pl.revenue.booking_revenue)}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-gray-500">Expenses</p>
          <p className="font-mono text-sm font-bold text-rose-700 tabular-nums">{formatBDT(pl.expenses.total)}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-gray-500">Profit</p>
          <p className={`font-mono text-sm font-bold tabular-nums ${grossPositive ? 'text-emerald-700' : 'text-red-700'}`}>
            {grossPositive ? '+' : ''}{formatBDT(pl.profit.gross)}
          </p>
        </div>
      </div>

      <p className="mt-2 text-[10px] text-gray-400 italic text-right">
        Cash net: <span className="font-mono">{pl.profit.cash_net >= 0 ? '+' : ''}{formatBDT(pl.profit.cash_net)}</span>
      </p>
    </Link>
  )
}
