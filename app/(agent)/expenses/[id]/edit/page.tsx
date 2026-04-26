import { notFound } from 'next/navigation'
import { Topbar } from '@/components/layout/Topbar'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import { ExpenseForm } from '@/components/expenses/ExpenseForm'
import { getExpenseById, getActiveCategories, getActivePayees } from '@/lib/queries/expenses'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: { id: string }
}

export default async function EditExpensePage({ params }: PageProps) {
  const [expense, categories, payees] = await Promise.all([
    getExpenseById(params.id),
    getActiveCategories(),
    getActivePayees(),
  ])

  if (!expense) notFound()

  return (
    <div className="flex h-full flex-col">
      <Topbar title="Edit Expense" />

      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        <div className="mx-auto max-w-2xl">
          <Card>
            <CardHeader>
              <CardTitle>Expense Details</CardTitle>
            </CardHeader>
            <ExpenseForm
              categories={categories}
              payees={payees}
              existing={expense}
            />
          </Card>
        </div>
      </div>
    </div>
  )
}
