import Link from 'next/link'
import { Topbar } from '@/components/layout/Topbar'
import { requirePermission } from '@/lib/auth/permissions'
import { listCategories } from '@/lib/queries/fixed-assets'
import { MigrationErrorBanner } from '@/components/fixed-assets/MigrationErrorBanner'
import { CategoriesEditor } from '@/components/fixed-assets/CategoriesEditor'

export const dynamic = 'force-dynamic'

export default async function AssetCategoriesSettingsPage() {
  await requirePermission('settings', 'write')

  let migrationError: string | null = null
  let categories: Awaited<ReturnType<typeof listCategories>> = []
  try {
    categories = await listCategories()
  } catch (err) {
    migrationError = err instanceof Error ? err.message : String(err)
  }

  return (
    <div className="flex h-full flex-col">
      <Topbar title="Asset Categories" subtitle="Default useful life & salvage % per category" />
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 space-y-4">
        {migrationError ? <MigrationErrorBanner error={migrationError} /> : <CategoriesEditor categories={categories} />}
        <Link href="/settings" className="inline-block text-sm text-zinc-700 hover:underline">← Back to Settings</Link>
      </div>
    </div>
  )
}
