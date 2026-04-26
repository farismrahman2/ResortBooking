import { Topbar } from '@/components/layout/Topbar'
import { ExpenseAnalyticsClient } from '@/components/expenses/ExpenseAnalyticsClient'
import { MigrationErrorBanner } from '@/components/expenses/MigrationErrorBanner'
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

  let data: {
    summary: Awaited<ReturnType<typeof getExpenseTotalsSummary>>
    daily:   Awaited<ReturnType<typeof getDailyExpenseTrend>>
    cats:    Awaited<ReturnType<typeof getCategoryBreakdown>>
    payees:  Awaited<ReturnType<typeof getPayeeBreakdown>>
    pl:      Awaited<ReturnType<typeof getProfitAndLoss>>
  } | null = null
  let migrationError: string | null = null

  try {
    const [summary, daily, cats, payees, pl] = await Promise.all([
      getExpenseTotalsSummary(from, to),
      getDailyExpenseTrend(from, to),
      getCategoryBreakdown(from, to),
      getPayeeBreakdown(from, to),
      getProfitAndLoss(from, to),
    ])
    data = { summary, daily, cats, payees, pl }
  } catch (err) {
    migrationError = err instanceof Error ? err.message : String(err)
  }

  return (
    <div className="flex h-full flex-col">
      <Topbar title="Expense Analytics" subtitle="Spending trends + Profit & Loss" />
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 print:overflow-visible print:p-0">
        {migrationError ? (
          <div className="mx-auto max-w-3xl">
            <MigrationErrorBanner error={migrationError} />
          </div>
        ) : data && (
          <ExpenseAnalyticsClient
            from={from}
            to={to}
            summary={data.summary}
            daily={data.daily}
            categories={data.cats}
            payees={data.payees}
            pl={data.pl}
          />
        )}
      </div>
    </div>
  )
}
