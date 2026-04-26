import { Topbar } from '@/components/layout/Topbar'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import { ExpenseForm } from '@/components/expenses/ExpenseForm'
import { getActiveCategories, getActivePayees } from '@/lib/queries/expenses'

export const dynamic = 'force-dynamic'

export default async function NewExpensePage() {
  const [categories, payees] = await Promise.all([
    getActiveCategories(),
    getActivePayees(),
  ])

  return (
    <div className="flex h-full flex-col">
      <Topbar title="New Expense" subtitle="Record a single transaction" />

      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        <div className="mx-auto max-w-2xl">
          <Card>
            <CardHeader>
              <CardTitle>Expense Details</CardTitle>
            </CardHeader>
            <ExpenseForm categories={categories} payees={payees} />
          </Card>
        </div>
      </div>
    </div>
  )
}
