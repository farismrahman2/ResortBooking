import Link from 'next/link'
import { Topbar } from '@/components/layout/Topbar'
import { requirePermission, hasPermission } from '@/lib/auth/permissions'
import { listOpportunities } from '@/lib/queries/crm'
import { MigrationErrorBanner } from '@/components/crm/MigrationErrorBanner'
import { OpportunitiesTable } from '@/components/crm/OpportunitiesTable'

export const dynamic = 'force-dynamic'

export default async function OpportunitiesPage({ searchParams }: { searchParams: { view?: string } }) {
  await requirePermission('crm', 'read')
  const canWrite = await hasPermission('crm', 'write')
  const view = searchParams.view === 'all' ? 'all' : 'mine'

  let migrationError: string | null = null
  let opps: Awaited<ReturnType<typeof listOpportunities>> = []
  try {
    opps = await listOpportunities({ ownerView: view })
  } catch (err) {
    migrationError = err instanceof Error ? err.message : String(err)
  }

  return (
    <div className="flex h-full flex-col">
      <Topbar title="Opportunities" subtitle="All deals (table view)"
        action={canWrite ? { label: 'New opportunity', href: '/crm/opportunities/new' } : undefined} />
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 space-y-4">
        {migrationError ? <MigrationErrorBanner error={migrationError} /> : (
          <>
            <Link href="/crm/pipeline" className="text-sm text-amber-700 hover:underline">← Kanban view</Link>
            <OpportunitiesTable opportunities={opps} />
          </>
        )}
      </div>
    </div>
  )
}
