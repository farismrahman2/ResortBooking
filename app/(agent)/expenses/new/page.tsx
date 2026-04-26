import { Topbar } from '@/components/layout/Topbar'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import { ExpenseForm } from '@/components/expenses/ExpenseForm'
import { MigrationErrorBanner } from '@/components/expenses/MigrationErrorBanner'
import { getActiveCategories, getActivePayees } from '@/lib/queries/expenses'

export const dynamic = 'force-dynamic'

export default async function NewExpensePage() {
  let categories: Awaited<ReturnType<typeof getActiveCategories>> = []
  let payees: Awaited<ReturnType<typeof getActivePayees>>         = []
  let migrationError: string | null = null
  try {
    [categories, payees] = await Promise.all([getActiveCategories(), getActivePayees()])
  } catch (err) {
    migrationError = err instanceof Error ? err.message : String(err)
  }

  return (
    <div className="flex h-full flex-col">
      <Topbar title="New Expense" subtitle="Record a single transaction" />

      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        <div className="mx-auto max-w-2xl space-y-4">
          {migrationError ? (
            <MigrationErrorBanner error={migrationError} />
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Expense Details</CardTitle>
              </CardHeader>
              <ExpenseForm categories={categories} payees={payees} />
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
