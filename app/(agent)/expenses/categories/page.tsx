import { Topbar } from '@/components/layout/Topbar'
import { CategoryManager } from '@/components/expenses/CategoryManager'
import { getAllCategories } from '@/lib/queries/expenses'

export const dynamic = 'force-dynamic'

export default async function CategoriesPage() {
  const categories = await getAllCategories()

  return (
    <div className="flex h-full flex-col">
      <Topbar title="Expense Categories" subtitle="Buckets for grouping expenses" />

      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        <div className="mx-auto max-w-5xl">
          <CategoryManager categories={categories} />
        </div>
      </div>
    </div>
  )
}
