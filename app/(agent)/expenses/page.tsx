import Link from 'next/link'
import { Topbar } from '@/components/layout/Topbar'
import { Button } from '@/components/ui/Button'
import { ExpenseFilters } from '@/components/expenses/ExpenseFilters'
import { ExpenseTable } from '@/components/expenses/ExpenseTable'
import { Plus, ListChecks, AlertCircle } from 'lucide-react'
import {
  getExpenses,
  getActiveCategories,
  getActivePayees,
} from '@/lib/queries/expenses'
import { toISODate } from '@/lib/formatters/dates'
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
  // Default range = current month
  const now  = new Date()
  const from = searchParams.from ?? toISODate(new Date(now.getFullYear(), now.getMonth(), 1))
  const to   = searchParams.to   ?? toISODate(new Date(now.getFullYear(), now.getMonth() + 1, 0))

  const [{ rows, total }, categories, payees] = await Promise.all([
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
  ])

  const grandTotal = rows.reduce((s, r) => s + Number(r.amount ?? 0), 0)

  return (
    <div className="flex h-full flex-col">
      <Topbar title="Expenses" subtitle="Day-to-day spending" />

      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 space-y-4">
        {/* Action bar */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <p className="text-sm text-gray-500">
              <span className="font-medium text-gray-700">{total}</span> expenses
              {' · '}<span className="font-mono font-semibold text-rose-700">{formatBDT(grandTotal)}</span>
              {' shown'}
            </p>
          </div>
          <div className="flex items-center gap-2">
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

        {/* Pending drafts banner — only render if anything is in draft state. Phase 3 fully wires
            the drafts page; Phase 1 still surfaces the count if any drafts exist (via includeDrafts) */}
        {/* Placeholder: real banner ships in Phase 3 alongside the drafts page */}

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
        <div className="flex items-center justify-end gap-3 text-xs text-gray-500">
          <Link href="/expenses/categories" className="hover:text-forest-700 hover:underline">Manage categories</Link>
          <span>·</span>
          <Link href="/expenses/payees" className="hover:text-forest-700 hover:underline">Manage payees</Link>
        </div>
      </div>
    </div>
  )
}

// Suppress unused-import warning for AlertCircle (reserved for Phase 3 drafts banner)
const _reserve = AlertCircle
void _reserve
