import { notFound } from 'next/navigation'
import { Topbar } from '@/components/layout/Topbar'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import { ExpenseForm } from '@/components/expenses/ExpenseForm'
import { ReceiptThumbnails } from '@/components/expenses/ReceiptThumbnails'
import { ReceiptUploader } from '@/components/expenses/ReceiptUploader'
import { MigrationErrorBanner } from '@/components/expenses/MigrationErrorBanner'
import { getExpenseById, getActiveCategories, getActivePayees } from '@/lib/queries/expenses'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: { id: string }
}

export default async function EditExpensePage({ params }: PageProps) {
  let expense: Awaited<ReturnType<typeof getExpenseById>> = null
  let categories: Awaited<ReturnType<typeof getActiveCategories>> = []
  let payees: Awaited<ReturnType<typeof getActivePayees>>         = []
  let migrationError: string | null = null

  try {
    [expense, categories, payees] = await Promise.all([
      getExpenseById(params.id),
      getActiveCategories(),
      getActivePayees(),
    ])
  } catch (err) {
    migrationError = err instanceof Error ? err.message : String(err)
  }

  if (migrationError) {
    return (
      <div className="flex h-full flex-col">
        <Topbar title="Edit Expense" />
        <div className="px-6 py-6">
          <MigrationErrorBanner error={migrationError} />
        </div>
      </div>
    )
  }

  if (!expense) notFound()

  return (
    <div className="flex h-full flex-col">
      <Topbar title="Edit Expense" />

      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        <div className="mx-auto max-w-2xl space-y-5">
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

          <Card>
            <CardHeader>
              <CardTitle>Receipts</CardTitle>
            </CardHeader>
            <div className="space-y-3">
              <ReceiptThumbnails
                expenseId={expense.id}
                attachments={expense.attachments ?? []}
                editable
              />
              <ReceiptUploader expenseId={expense.id} expenseDate={expense.expense_date} />
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
