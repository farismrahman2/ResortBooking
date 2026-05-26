import Link from 'next/link'
import { Archive, Wrench, MapPin } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { requirePermission, hasPermission } from '@/lib/auth/permissions'
import { getFixedAssetsHubKpis } from '@/lib/queries/fixed-assets'
import { MigrationErrorBanner } from '@/components/fixed-assets/MigrationErrorBanner'
import { CONDITION_LABELS } from '@/components/fixed-assets/labels'
import { formatBDT } from '@/lib/formatters/currency'
import type { AssetCondition } from '@/lib/supabase/types-fixed-assets'

export const dynamic = 'force-dynamic'

export default async function FixedAssetsHubPage() {
  await requirePermission('fixed_assets', 'read')
  const canWrite = await hasPermission('fixed_assets', 'write')

  let migrationError: string | null = null
  let kpis: Awaited<ReturnType<typeof getFixedAssetsHubKpis>> | null = null
  try {
    kpis = await getFixedAssetsHubKpis()
  } catch (err) {
    migrationError = err instanceof Error ? err.message : String(err)
  }

  return (
    <div className="flex h-full flex-col">
      <Topbar title="Fixed Assets" subtitle="Asset register, depreciation & maintenance"
        action={canWrite ? { label: 'New asset', href: '/fixed-assets/assets/new' } : undefined} />
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 space-y-5">
        {migrationError ? <MigrationErrorBanner error={migrationError} /> : (
          <>
            <div className="flex flex-wrap items-center gap-4">
              <Link href="/fixed-assets/assets" className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-700 hover:underline"><Archive size={14} /> Register</Link>
              <Link href="/fixed-assets/maintenance" className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-700 hover:underline"><Wrench size={14} /> Maintenance</Link>
              <Link href="/fixed-assets/locations" className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-700 hover:underline"><MapPin size={14} /> Locations</Link>
            </div>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Kpi label="Active assets" value={String(kpis?.total_assets ?? 0)} />
              <Kpi label="Acquisition cost" value={formatBDT(kpis?.total_acquisition ?? 0)} />
              <Kpi label="Net book value" value={formatBDT(kpis?.total_nbv ?? 0)} emphasis />
              <Kpi label="Maintenance due (30d)" value={String(kpis?.maintenance_due ?? 0)} danger={!!kpis?.maintenance_due} />
            </div>
            <div>
              <h3 className="mb-2 text-sm font-semibold text-gray-900">By condition</h3>
              <div className="flex flex-wrap gap-2 text-sm">
                {(Object.keys(CONDITION_LABELS) as AssetCondition[]).map((c) => (
                  <span key={c} className="rounded-lg border border-gray-200 bg-white px-3 py-1.5">
                    {CONDITION_LABELS[c]}: <span className="font-semibold">{kpis?.by_condition[c] ?? 0}</span>
                  </span>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function Kpi({ label, value, emphasis, danger }: { label: string; value: string; emphasis?: boolean; danger?: boolean }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${danger ? 'text-red-700' : emphasis ? 'text-zinc-800' : 'text-gray-900'}`}>{value}</p>
    </div>
  )
}
