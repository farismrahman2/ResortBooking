import Link from 'next/link'
import { Topbar } from '@/components/layout/Topbar'
import { requirePermission, hasPermission } from '@/lib/auth/permissions'
import { listSuppliers } from '@/lib/queries/inventory'
import { MigrationErrorBanner } from '@/components/inventory/MigrationErrorBanner'
import { SuppliersTable } from '@/components/inventory/SuppliersTable'

export const dynamic = 'force-dynamic'

export default async function SuppliersListPage() {
  await requirePermission('inventory', 'read')
  const canWrite = await hasPermission('inventory', 'write')

  let migrationError: string | null = null
  let suppliers: Awaited<ReturnType<typeof listSuppliers>> = []
  try {
    suppliers = await listSuppliers()
  } catch (err) {
    migrationError = err instanceof Error ? err.message : String(err)
  }

  return (
    <div className="flex h-full flex-col">
      <Topbar
        title="Suppliers"
        subtitle="Vendors for inventory receipts"
        action={canWrite ? { label: 'New supplier', href: '/inventory/suppliers/new' } : undefined}
      />
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 space-y-4">
        {migrationError ? <MigrationErrorBanner error={migrationError} /> : <SuppliersTable suppliers={suppliers} />}
        <Link href="/inventory" className="inline-block text-sm text-teal-700 hover:underline">← Back to Inventory</Link>
      </div>
    </div>
  )
}
