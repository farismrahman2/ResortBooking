import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Topbar } from '@/components/layout/Topbar'
import { requirePermission, getCurrentUserContext } from '@/lib/auth/permissions'
import { getKpiTrackerForUser, listSalesReps } from '@/lib/queries/crm'
import { MigrationErrorBanner } from '@/components/crm/MigrationErrorBanner'
import { KpiView } from '@/components/crm/KpiView'

export const dynamic = 'force-dynamic'

export default async function MyKpiPage() {
  await requirePermission('crm', 'read')
  const ctx = await getCurrentUserContext()
  if (!ctx) redirect('/login')

  const elevated = ['admin', 'md', 'manager', 'operations_manager'].includes(ctx.profile.role.slug)

  let migrationError: string | null = null
  try {
    // Elevated viewers without their own sales targets: show a rep switcher.
    if (elevated) {
      const reps = await listSalesReps()
      return (
        <div className="flex h-full flex-col">
          <Topbar title="KPI Tracker" subtitle="Pick a sales rep" />
          <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 space-y-2">
            {reps.length === 0 && <p className="text-sm text-gray-500">No corporate_sales users yet.</p>}
            {reps.map((r) => (
              <Link key={r.user_id} href={`/crm/kpi/${r.user_id}`}
                className="block rounded-lg border border-gray-200 bg-white px-4 py-2.5 hover:border-amber-300 font-medium text-gray-900">
                {r.full_name}
              </Link>
            ))}
            <Link href="/crm" className="inline-block pt-2 text-sm text-amber-700 hover:underline">← Back to Corporate Sales</Link>
          </div>
        </div>
      )
    }

    const tracker = await getKpiTrackerForUser(ctx.user_id)
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
