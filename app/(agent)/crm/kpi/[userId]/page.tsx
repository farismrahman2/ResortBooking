import { Topbar } from '@/components/layout/Topbar'
import { requirePermission, getCurrentUserContext } from '@/lib/auth/permissions'
import { redirect } from 'next/navigation'
import { getKpiTrackerForUser } from '@/lib/queries/crm'
import { MigrationErrorBanner } from '@/components/crm/MigrationErrorBanner'
import { KpiView } from '@/components/crm/KpiView'

export const dynamic = 'force-dynamic'

export default async function UserKpiPage({ params }: { params: { userId: string } }) {
  await requirePermission('crm', 'read')
  const ctx = await getCurrentUserContext()
  if (!ctx) redirect('/login')

  // A corporate_sales user may only view their own tracker.
  const elevated = ['admin', 'md', 'manager', 'operations_manager'].includes(ctx.profile.role.slug)
  if (!elevated && ctx.user_id !== params.userId) redirect('/crm/kpi')

  let migrationError: string | null = null
  try {
    const tracker = await getKpiTrackerForUser(params.userId)
    return <KpiView tracker={tracker} />
  } catch (err) {
    migrationError = err instanceof Error ? err.message : String(err)
  }
  return (
    <div className="flex h-full flex-col">
      <Topbar title="KPI Tracker" />
      <div className="px-4 py-6 sm:px-6"><MigrationErrorBanner error={migrationError!} /></div>
    </div>
  )
}
