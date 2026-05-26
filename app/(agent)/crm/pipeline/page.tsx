import Link from 'next/link'
import { Topbar } from '@/components/layout/Topbar'
import { requirePermission, hasPermission } from '@/lib/auth/permissions'
import { getPipelineByStage, listSectors } from '@/lib/queries/crm'
import { getCrmVisibility } from '@/lib/crm/visibility'
import { MigrationErrorBanner } from '@/components/crm/MigrationErrorBanner'
import { PipelineBoard } from '@/components/crm/PipelineBoard'
import { OwnerToggle } from '@/components/crm/OwnerToggle'

export const dynamic = 'force-dynamic'

export default async function PipelinePage({ searchParams }: { searchParams: { view?: string } }) {
  await requirePermission('crm', 'read')
  const canWrite = await hasPermission('crm', 'write')
  const view = searchParams.view === 'all' ? 'all' : 'mine'

  let migrationError: string | null = null
  try {
    const vis = await getCrmVisibility()
    const columns = await getPipelineByStage(view)
    await listSectors()
    const showToggle = vis ? !vis.elevated : false
    const totalCount = columns.reduce((s, c) => s + c.count, 0)

    return (
      <div className="flex h-full flex-col">
        <Topbar title="Pipeline" subtitle="10-stage opportunity board"
          action={canWrite ? { label: 'New opportunity', href: '/crm/opportunities/new' } : undefined} />
        <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {showToggle ? <OwnerToggle mineCount={totalCount} allCount={totalCount} current={view} /> : <span />}
            <Link href="/crm/opportunities" className="text-sm text-amber-700 hover:underline">Table view →</Link>
          </div>
          <PipelineBoard columns={columns} />
          <Link href="/crm" className="inline-block text-sm text-amber-700 hover:underline">← Back to Corporate Sales</Link>
        </div>
      </div>
    )
  } catch (err) {
    migrationError = err instanceof Error ? err.message : String(err)
  }
  return (
    <div className="flex h-full flex-col">
      <Topbar title="Pipeline" />
      <div className="px-4 py-6 sm:px-6"><MigrationErrorBanner error={migrationError!} /></div>
    </div>
  )
}
