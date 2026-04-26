import { Topbar } from '@/components/layout/Topbar'
import { ExpenseAnalyticsClient } from '@/components/expenses/ExpenseAnalyticsClient'
import {
  getExpenseTotalsSummary,
  getDailyExpenseTrend,
  getCategoryBreakdown,
  getPayeeBreakdown,
  getProfitAndLoss,
} from '@/lib/queries/expenses'
import { toISODate } from '@/lib/formatters/dates'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: { from?: string; to?: string }
}

export default async function ExpenseAnalyticsPage({ searchParams }: PageProps) {
  const now  = new Date()
  const defaultFrom = toISODate(new Date(now.getFullYear(), now.getMonth(), 1))
  const defaultTo   = toISODate(new Date(now.getFullYear(), now.getMonth() + 1, 0))
  const from = searchParams.from ?? defaultFrom
  const to   = searchParams.to   ?? defaultTo

  const [summary, daily, categories, payees, pl] = await Promise.all([
    getExpenseTotalsSummary(from, to),
    getDailyExpenseTrend(from, to),
    getCategoryBreakdown(from, to),
    getPayeeBreakdown(from, to),
    getProfitAndLoss(from, to),
  ])

  return (
    <div className="flex h-full flex-col">
      <Topbar title="Expense Analytics" subtitle="Spending trends + Profit & Loss" />
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 print:overflow-visible print:p-0">
        <ExpenseAnalyticsClient
          from={from}
          to={to}
          summary={summary}
          daily={daily}
          categories={categories}
          payees={payees}
          pl={pl}
        />
      </div>
    </div>
  )
}
