import { Topbar } from '@/components/layout/Topbar'
import { RecurringTemplatesList } from '@/components/expenses/RecurringTemplatesList'
import {
  getRecurringTemplates,
  getActiveCategories,
  getActivePayees,
} from '@/lib/queries/expenses'

export const dynamic = 'force-dynamic'

function currentMonthIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export default async function RecurringPage() {
  let templates: Awaited<ReturnType<typeof getRecurringTemplates>> = []
  let categories: Awaited<ReturnType<typeof getActiveCategories>> = []
  let payees: Awaited<ReturnType<typeof getActivePayees>> = []
  let migrationError: string | null = null
  try {
    [templates, categories, payees] = await Promise.all([
      getRecurringTemplates(),
      getActiveCategories(),
      getActivePayees(),
    ])
  } catch (err) {
    migrationError = err instanceof Error ? err.message : String(err)
  }

  return (
    <div className="flex h-full flex-col">
      <Topbar title="Recurring Expenses" subtitle="Auto-generated monthly drafts" />

      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        <div className="mx-auto max-w-6xl">
          {migrationError ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              Could not load templates. {migrationError}
            </div>
          ) : (
            <RecurringTemplatesList
              templates={templates}
              categories={categories}
              payees={payees}
              defaultMonth={currentMonthIso()}
            />
          )}
        </div>
      </div>
    </div>
  )
}
