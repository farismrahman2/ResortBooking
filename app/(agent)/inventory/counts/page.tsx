import Link from 'next/link'
import { Topbar } from '@/components/layout/Topbar'
import { requirePermission, hasPermission } from '@/lib/auth/permissions'
import { listCounts } from '@/lib/queries/inventory'
import { MigrationErrorBanner } from '@/components/inventory/MigrationErrorBanner'
import { CountsTable } from '@/components/inventory/CountsTable'

export const dynamic = 'force-dynamic'

export default async function CountsPage() {
  await requirePermission('inventory', 'read')
  const canWrite = await hasPermission('inventory', 'write')

  let migrationError: string | null = null
  let counts: Awaited<ReturnType<typeof listCounts>> = []
  try {
    counts = await listCounts()
  } catch (err) {
    migrationError = err instanceof Error ? err.message : String(err)
  }

  return (
    <div className="flex h-full flex-col">
      <Topbar title="Stock Counts" subtitle="Physical count & reconciliation"
        action={canWrite ? { label: 'New count', href: '/inventory/counts/new' } : undefined} />
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 space-y-4">
        {migrationError ? <MigrationErrorBanner error={migrationError} /> : <CountsTable counts={counts} />}
        <Link href="/inventory" className="inline-block text-sm text-teal-700 hover:underline">← Back to Inventory</Link>
      </div>
    </div>
  )
}
