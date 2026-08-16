import Link from 'next/link'
import { Topbar } from '@/components/layout/Topbar'
import { Button } from '@/components/ui/Button'
import { ExpenseFilters } from '@/components/expenses/ExpenseFilters'
import { ExpenseTable } from '@/components/expenses/ExpenseTable'
import { MigrationErrorBanner } from '@/components/expenses/MigrationErrorBanner'
import { Plus, ListChecks, BarChart3, FileSpreadsheet, AlertCircle } from 'lucide-react'
import {
  getExpenses,
  getActiveCategories,
  getActivePayees,
  getDraftCount,
} from '@/lib/queries/expenses'
import { todayDhaka, monthStartDhaka } from '@/lib/dates'
import { formatBDT } from '@/lib/formatters/currency'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: {
    from?:          string
    to?:            string
    categoryId?:    string
    payeeId?:       string
    paymentMethod?: string
    search?:        string
  }
}

export default async function ExpensesPage({ searchParams }: PageProps) {
  // Default range = current month on the RESORT's calendar. Server-side
  // new Date() is UTC, which is a day behind Asia/Dhaka until 6am local — on
  // the 1st of the month that put the default view on LAST month.
  const today = todayDhaka()
  const [ty, tm] = today.split('-').map(Number)
  const from = searchParams.from ?? monthStartDhaka(today)
  const to   = searchParams.to   ?? new Date(Date.UTC(ty, tm, 0)).toISOString().slice(0, 10)  // last day of month

  let rows: Awaited<ReturnType<typeof getExpenses>>['rows']      = []
  let total                                                      = 0
  let categories: Awaited<ReturnType<typeof getActiveCategories>> = []
  let payees: Awaited<ReturnType<typeof getActivePayees>>         = []
  let draftCount                                                  = 0
  let migrationError: string | null = null

  try {
    const [list, cats, ps, drs] = await Promise.all([
      getExpenses({
        from,
        to,
        categoryId:    searchParams.categoryId,
        payeeId:       searchParams.payeeId,
        paymentMethod: searchParams.paymentMethod,
        search:        searchParams.search,
        limit:         100,
      }),
      getActiveCategories(),
      getActivePayees(),
      // Count only — the banner shows a number; fetching every draft row with
      // three joins to render it was pure waste.
      getDraftCount().catch(() => 0),
    ])
    rows  = list.rows; total = list.total
    categories = cats; payees = ps; draftCount = drs
  } catch (err) {
    migrationError = err instanceof Error ? err.message : String(err)
  }

  const grandTotal = rows.reduce((s, r) => s + Number(r.amount ?? 0), 0)

  return (
    <div className="flex h-full flex-col">
      <Topbar title="Expenses" subtitle="Day-to-day spending" />

      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 space-y-4">
        {migrationError && <MigrationErrorBanner error={migrationError} />}

        {/* Action bar */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <p className="text-sm text-gray-500">
              <span className="font-medium text-gray-700">{total}</span> expenses
              {' · '}<span className="font-mono font-semibold text-rose-700">{formatBDT(grandTotal)}</span>
              {' shown'}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Link href="/expenses/report">
              <Button variant="outline" size="md" className="gap-1.5">
                <FileSpreadsheet size={14} />
                Monthly Report
              </Button>
            </Link>
            <Link href="/expenses/analytics">
              <Button variant="outline" size="md" className="gap-1.5">
                <BarChart3 size={14} />
                Analytics
              </Button>
            </Link>
            <Link href="/expenses/bulk">
              <Button variant="outline" size="md" className="gap-1.5">
                <ListChecks size={14} />
                Daily Entry
              </Button>
            </Link>
            <Link href="/expenses/new">
              <Button variant="primary" size="md" className="gap-1.5">
                <Plus size={14} />
                New Expense
              </Button>
            </Link>
          </div>
        </div>

        {/* Pending drafts banner */}
        {draftCount > 0 && (
          <Link
            href="/expenses/drafts"
            className="flex items-center justify-between rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 hover:bg-amber-100/60 transition-colors"
          >
            <div className="flex items-center gap-2">
              <AlertCircle size={16} className="text-amber-700" />
              <span className="text-sm font-medium text-amber-900">
                {draftCount} pending draft{draftCount !== 1 ? 's' : ''} from recurring templates — review and confirm
              </span>
            </div>
            <span className="text-xs font-semibold text-amber-700">Review →</span>
          </Link>
        )}

        <ExpenseFilters
          from={from}
          to={to}
          categoryId={searchParams.categoryId ?? ''}
          payeeId={searchParams.payeeId ?? ''}
          paymentMethod={searchParams.paymentMethod ?? ''}
          search={searchParams.search ?? ''}
          categories={categories}
          payees={payees}
        />

        <ExpenseTable rows={rows} total={total} />

        {/* Quick links to admin */}
        <div className="flex items-center justify-end gap-3 text-xs text-gray-500 flex-wrap">
          <Link href="/expenses/budgets"    className="hover:text-forest-700 hover:underline">Budgets</Link>
          <span>·</span>
          <Link href="/expenses/recurring"  className="hover:text-forest-700 hover:underline">Recurring templates</Link>
          <span>·</span>
          <Link href="/expenses/drafts"     className="hover:text-forest-700 hover:underline">Pending drafts</Link>
          <span>·</span>
          <Link href="/expenses/categories" className="hover:text-forest-700 hover:underline">Categories</Link>
          <span>·</span>
          <Link href="/expenses/payees"     className="hover:text-forest-700 hover:underline">Payees</Link>
        </div>
      </div>
    </div>
  )
}

