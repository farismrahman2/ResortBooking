import { Topbar } from '@/components/layout/Topbar'
import { CategoryManager } from '@/components/expenses/CategoryManager'
import { MigrationErrorBanner } from '@/components/expenses/MigrationErrorBanner'
import { getAllCategories } from '@/lib/queries/expenses'

export const dynamic = 'force-dynamic'

export default async function CategoriesPage() {
  let categories: Awaited<ReturnType<typeof getAllCategories>> = []
  let migrationError: string | null = null
  try {
    categories = await getAllCategories()
  } catch (err) {
    migrationError = err instanceof Error ? err.message : String(err)
  }

  return (
    <div className="flex h-full flex-col">
      <Topbar title="Expense Categories" subtitle="Buckets for grouping expenses" />

      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        <div className="mx-auto max-w-5xl">
          {migrationError ? <MigrationErrorBanner error={migrationError} /> : <CategoryManager categories={categories} />}
        </div>
      </div>
    </div>
  )
}
