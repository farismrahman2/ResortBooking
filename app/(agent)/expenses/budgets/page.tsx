import { Topbar } from '@/components/layout/Topbar'
import { BudgetManager } from '@/components/expenses/BudgetManager'
import { BudgetTabs } from './BudgetTabs'
import {
  getActiveCategories,
  getBudgetVsActual,
} from '@/lib/queries/expenses'
import type { BudgetPeriodType } from '@/lib/supabase/types'
import { toISODate } from '@/lib/formatters/dates'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: { period?: string; start?: string }
}

function defaultStart(period: BudgetPeriodType): string {
  const d = new Date()
  if (period === 'yearly') {
    return toISODate(new Date(d.getFullYear(), 0, 1))
  }
  return toISODate(new Date(d.getFullYear(), d.getMonth(), 1))
}

function periodLabel(period: BudgetPeriodType, start: string): string {
  const d = new Date(start + 'T00:00:00')
  if (period === 'yearly') return `Year ${d.getFullYear()}`
  return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
}

export default async function BudgetsPage({ searchParams }: PageProps) {
  const period: BudgetPeriodType = searchParams.period === 'yearly' ? 'yearly' : 'monthly'
  const periodStart = searchParams.start && /^\d{4}-\d{2}-\d{2}$/.test(searchParams.start)
    ? searchParams.start
    : defaultStart(period)

  let vsActual: Awaited<ReturnType<typeof getBudgetVsActual>> = []
  let categories: Awaited<ReturnType<typeof getActiveCategories>> = []
  let migrationError: string | null = null
  try {
    ;[vsActual, categories] = await Promise.all([
      getBudgetVsActual(period, periodStart),
      getActiveCategories(),
    ])
  } catch (err) {
    migrationError = err instanceof Error ? err.message : String(err)
  }

  const label = periodLabel(period, periodStart)

  return (
    <div className="flex h-full flex-col">
      <Topbar title="Budgets" subtitle="Per-category monthly + yearly limits" />

      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        <div className="mx-auto max-w-5xl space-y-4">
          <BudgetTabs period={period} periodStart={periodStart} />

          {migrationError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              Could not load budgets. Make sure migrations 000–002 have been run.
              <br />
              <span className="text-xs font-mono">{migrationError}</span>
            </div>
          )}

          {!migrationError && (
            <BudgetManager
              period={period}
              periodStart={periodStart}
              periodLabel={label}
              categories={categories}
              vsActual={vsActual}
            />
          )}
        </div>
      </div>
    </div>
  )
}
