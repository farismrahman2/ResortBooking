import Link from 'next/link'
import { Topbar } from '@/components/layout/Topbar'
import { requirePermission, hasPermission } from '@/lib/auth/permissions'
import { getCrmHubKpis } from '@/lib/queries/crm'
import { MigrationErrorBanner } from '@/components/crm/MigrationErrorBanner'
import { StatusBadge } from '@/components/crm/StatusBadge'
import { STATUS_LABELS } from '@/components/crm/labels'
import type { AccountStatus } from '@/lib/supabase/types-crm'

export const dynamic = 'force-dynamic'

export default async function CrmHubPage() {
  await requirePermission('crm', 'read')
  const canWrite = await hasPermission('crm', 'write')

  let migrationError: string | null = null
  let kpis: Awaited<ReturnType<typeof getCrmHubKpis>> | null = null
  try {
    kpis = await getCrmHubKpis()
  } catch (err) {
    migrationError = err instanceof Error ? err.message : String(err)
  }

  return (
    <div className="flex h-full flex-col">
      <Topbar title="Corporate Sales" subtitle="Accounts, pipeline & activities"
        action={canWrite ? { label: 'New account', href: '/crm/accounts/new' } : undefined} />
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 space-y-5">
        {migrationError ? <MigrationErrorBanner error={migrationError} /> : (
          <>
            <div className="flex flex-wrap items-center gap-4">
              <Link href="/crm/accounts" className="text-sm font-medium text-amber-700 hover:underline">Accounts →</Link>
              <Link href="/crm/pipeline" className="text-sm font-medium text-amber-700 hover:underline">Pipeline →</Link>
              <Link href="/crm/opportunities" className="text-sm font-medium text-amber-700 hover:underline">Opportunities →</Link>
              <Link href="/crm/activities" className="text-sm font-medium text-amber-700 hover:underline">Activities →</Link>
              <Link href="/crm/kpi" className="text-sm font-medium text-amber-700 hover:underline">KPI Tracker →</Link>
              <Link href="/crm/reports" className="text-sm font-medium text-amber-700 hover:underline">Reports →</Link>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <Kpi label="Total accounts" value={String(kpis?.total_accounts ?? 0)} emphasis />
              {(Object.keys(STATUS_LABELS) as AccountStatus[]).map((s) => (
                <Kpi key={s} label={STATUS_LABELS[s]} value={String(kpis?.by_status[s] ?? 0)} />
              ))}
            </div>

            <div>
              <h3 className="mb-2 text-sm font-semibold text-gray-900">Recently engaged</h3>
              {(kpis?.recent.length ?? 0) === 0 ? (
                <p className="rounded-lg border border-dashed border-gray-200 p-6 text-center text-sm text-gray-400">No accounts yet.</p>
              ) : (
                <div className="space-y-2">
                  {kpis!.recent.map((a) => (
                    <Link key={a.id} href={`/crm/accounts/${a.id}`}
                      className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-2.5 hover:border-amber-300">
                      <div>
                        <p className="font-medium text-gray-900">{a.company_name}</p>
                        <p className="text-xs text-gray-400">{a.sector?.display_name ?? '—'} · {a.owner_name ?? 'unassigned'}</p>
                      </div>
                      <StatusBadge status={a.status} />
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function Kpi({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${emphasis ? 'text-amber-700' : 'text-gray-900'}`}>{value}</p>
    </div>
  )
}
