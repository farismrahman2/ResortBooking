import { Topbar } from '@/components/layout/Topbar'
import { DailyExpenseGrid } from '@/components/expenses/DailyExpenseGrid'
import { getActiveCategories, getActivePayees } from '@/lib/queries/expenses'
import { toISODate } from '@/lib/formatters/dates'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: { date?: string }
}

export default async function BulkEntryPage({ searchParams }: PageProps) {
  const [categories, payees] = await Promise.all([
    getActiveCategories(),
    getActivePayees(),
  ])

  const defaultDate = searchParams.date ?? toISODate(new Date())

  return (
    <div className="flex h-full flex-col">
      <Topbar title="Daily Expense Entry" subtitle="Enter all of today's expenses at once" />

      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        <div className="mx-auto max-w-4xl">
          <DailyExpenseGrid
            categories={categories}
            payees={payees}
            defaultDate={defaultDate}
          />
        </div>
      </div>
    </div>
  )
}
