import Link from 'next/link'
import { Topbar } from '@/components/layout/Topbar'
import { requirePermission } from '@/lib/auth/permissions'
import { listSalesReps } from '@/lib/queries/crm'
import { createClient } from '@/lib/supabase/server'
import { MigrationErrorBanner } from '@/components/crm/MigrationErrorBanner'
import { KpiTargetsEditor } from '@/components/crm/KpiTargetsEditor'

export const dynamic = 'force-dynamic'

export default async function CrmKpiSettingsPage({ searchParams }: { searchParams: { user?: string } }) {
  await requirePermission('settings', 'write')

  let migrationError: string | null = null
  try {
    const reps = await listSalesReps()

    if (!searchParams.user) {
      return (
        <div className="flex h-full flex-col">
          <Topbar title="CRM KPI Targets" subtitle="Pick a sales rep to set 30/60/90-day targets" />
          <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 space-y-2">
            {reps.length === 0 && <p className="text-sm text-gray-500">No corporate_sales users yet.</p>}
            {reps.map((r) => (
              <Link key={r.user_id} href={`/settings/crm-kpi?user=${r.user_id}`}
                className="block rounded-lg border border-gray-200 bg-white px-4 py-2.5 hover:border-amber-300 font-medium text-gray-900">
                {r.full_name}
              </Link>
            ))}
            <Link href="/settings" className="inline-block pt-2 text-sm text-amber-700 hover:underline">← Back to Settings</Link>
          </div>
        </div>
      )
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: targets } = await (createClient() as any).from('crm_kpi_targets')
      .select('metric, period_days, target_value').eq('user_id', searchParams.user)
    const existing: Record<string, number> = {}
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const t of (targets ?? []) as any[]) existing[`${t.metric}:${t.period_days}`] = Number(t.target_value)
    const rep = reps.find((r) => r.user_id === searchParams.user)

    return (
      <div className="flex h-full flex-col">
        <Topbar title="CRM KPI Targets" subtitle={rep?.full_name ?? undefined} />
        <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 space-y-4">
          <KpiTargetsEditor userId={searchParams.user} existing={existing} />
          <Link href="/settings/crm-kpi" className="inline-block text-sm text-amber-700 hover:underline">← Pick another rep</Link>
        </div>
      </div>
    )
  } catch (err) {
    migrationError = err instanceof Error ? err.message : String(err)
  }
  return (
    <div className="flex h-full flex-col">
      <Topbar title="CRM KPI Targets" />
      <div className="px-4 py-6 sm:px-6"><MigrationErrorBanner error={migrationError!} /></div>
    </div>
  )
}
