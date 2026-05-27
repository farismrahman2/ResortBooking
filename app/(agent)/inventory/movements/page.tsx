import Link from 'next/link'
import { Topbar } from '@/components/layout/Topbar'
import { requirePermission, hasPermission } from '@/lib/auth/permissions'
import { listMovements } from '@/lib/queries/inventory'
import { MigrationErrorBanner } from '@/components/inventory/MigrationErrorBanner'
import { MovementsTable } from '@/components/inventory/MovementsTable'
import type { MovementType } from '@/lib/supabase/types-inventory'

export const dynamic = 'force-dynamic'

const TYPES: { slug: MovementType; label: string }[] = [
  { slug: 'receipt', label: 'Receipt' },
  { slug: 'issue', label: 'Issue' },
  { slug: 'transfer', label: 'Transfer' },
  { slug: 'adjustment', label: 'Adjustment' },
]

export default async function MovementsPage({ searchParams }: { searchParams: { type?: string } }) {
  await requirePermission('inventory', 'read')
  const canWrite = await hasPermission('inventory', 'write')
  const type = TYPES.find((t) => t.slug === searchParams.type)?.slug

  let migrationError: string | null = null
  let movements: Awaited<ReturnType<typeof listMovements>> = []
  try {
    movements = await listMovements({ type, status: 'all', limit: 200 })
  } catch (err) {
    migrationError = err instanceof Error ? err.message : String(err)
  }

  return (
    <div className="flex h-full flex-col">
      <Topbar title="Stock Movements" subtitle="Receipts, issues, transfers, adjustments" />
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 space-y-4">
        {migrationError ? <MigrationErrorBanner error={migrationError} /> : (
          <>
            {canWrite && (
              <div className="flex flex-wrap gap-2">
                {TYPES.map((t) => (
                  <Link key={t.slug} href={`/inventory/movements/new?type=${t.slug}`}
                    className="rounded-lg border border-teal-300 bg-teal-50 px-3 py-1.5 text-sm font-medium text-teal-700 hover:bg-teal-100">
                    + {t.label}
                  </Link>
                ))}
              </div>
            )}

            <div className="flex flex-wrap gap-2 text-sm">
              <Link href="/inventory/movements" className={`rounded-full px-3 py-1 ${!type ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600'}`}>All</Link>
              {TYPES.map((t) => (
                <Link key={t.slug} href={`/inventory/movements?type=${t.slug}`}
                  className={`rounded-full px-3 py-1 capitalize ${type === t.slug ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600'}`}>
                  {t.label}
                </Link>
              ))}
            </div>

            <MovementsTable movements={movements} />
            <Link href="/inventory" className="inline-block text-sm text-teal-700 hover:underline">← Back to Inventory</Link>
          </>
        )}
      </div>
    </div>
  )
}
