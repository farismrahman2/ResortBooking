import Link from 'next/link'
import { Topbar } from '@/components/layout/Topbar'
import { requirePermission } from '@/lib/auth/permissions'
import { listRecentMaintenance, getMaintenanceDue } from '@/lib/queries/fixed-assets'
import { MigrationErrorBanner } from '@/components/fixed-assets/MigrationErrorBanner'
import { MAINTENANCE_TYPE_LABELS } from '@/components/fixed-assets/labels'
import { formatBDT } from '@/lib/formatters/currency'

export const dynamic = 'force-dynamic'

export default async function MaintenancePage() {
  await requirePermission('fixed_assets', 'read')

  let migrationError: string | null = null
  let recent: Awaited<ReturnType<typeof listRecentMaintenance>> = []
  let due: Awaited<ReturnType<typeof getMaintenanceDue>> = []
  try {
    [recent, due] = await Promise.all([listRecentMaintenance(), getMaintenanceDue(30)])
  } catch (err) {
    migrationError = err instanceof Error ? err.message : String(err)
  }

  return (
    <div className="flex h-full flex-col">
      <Topbar title="Maintenance" subtitle="Service history & upcoming due" />
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 space-y-5">
        {migrationError ? <MigrationErrorBanner error={migrationError} /> : (
          <>
            {due.length > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                <p className="mb-2 text-sm font-semibold text-amber-900">Service due in the next 30 days</p>
                <ul className="space-y-1 text-sm text-amber-800">
                  {due.map((m) => (
                    <li key={m.id}>
                      <span className="font-medium">{m.next_service_date}</span> — {m.asset_name} ({m.asset_tag})
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
              <table className="min-w-full text-sm">
                <thead className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Date</th>
                    <th className="px-4 py-2.5 font-medium">Asset</th>
                    <th className="px-4 py-2.5 font-medium">Type</th>
                    <th className="px-4 py-2.5 font-medium">Description</th>
                    <th className="px-4 py-2.5 font-medium text-right">Cost</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {recent.length === 0 ? (
                    <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">No maintenance logged yet.</td></tr>
                  ) : recent.map((m) => (
                    <tr key={m.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5 text-gray-600">{m.maintenance_date}</td>
                      <td className="px-4 py-2.5">
                        <Link href={`/fixed-assets/assets/${m.asset_id}`} className="text-zinc-700 hover:underline">{m.asset_name}</Link>
                        <span className="ml-1 font-mono text-xs text-gray-400">{m.asset_tag}</span>
                      </td>
                      <td className="px-4 py-2.5 text-gray-600">{MAINTENANCE_TYPE_LABELS[m.maintenance_type]}</td>
                      <td className="px-4 py-2.5 text-gray-700">{m.description}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">{m.cost > 0 ? formatBDT(m.cost) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Link href="/fixed-assets" className="inline-block text-sm text-zinc-700 hover:underline">← Back to Fixed Assets</Link>
          </>
        )}
      </div>
    </div>
  )
}
