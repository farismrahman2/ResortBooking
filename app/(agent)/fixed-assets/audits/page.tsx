import Link from 'next/link'
import { Topbar } from '@/components/layout/Topbar'
import { requirePermission, hasPermission } from '@/lib/auth/permissions'
import { listAudits } from '@/lib/queries/fixed-assets'
import { MigrationErrorBanner } from '@/components/fixed-assets/MigrationErrorBanner'

export const dynamic = 'force-dynamic'

const STATUS_BADGE: Record<string, string> = {
  in_progress: 'bg-amber-50 text-amber-700', finalized: 'bg-emerald-50 text-emerald-700', cancelled: 'bg-gray-100 text-gray-500',
}

export default async function AuditsPage() {
  await requirePermission('fixed_assets', 'read')
  const canWrite = await hasPermission('fixed_assets', 'write')

  let migrationError: string | null = null
  let audits: Awaited<ReturnType<typeof listAudits>> = []
  try {
    audits = await listAudits()
  } catch (err) {
    migrationError = err instanceof Error ? err.message : String(err)
  }

  return (
    <div className="flex h-full flex-col">
      <Topbar title="Physical Audits" subtitle="Annual asset verification"
        action={canWrite ? { label: 'Start audit', href: '/fixed-assets/audits/new' } : undefined} />
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 space-y-4">
        {migrationError ? <MigrationErrorBanner error={migrationError} /> : (
          <>
            <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
              <table className="min-w-full text-sm">
                <thead className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                  <tr><th className="px-4 py-2.5 font-medium">Audit</th><th className="px-4 py-2.5 font-medium">Year</th><th className="px-4 py-2.5 font-medium">Started</th><th className="px-4 py-2.5 font-medium">Status</th></tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {audits.length === 0 ? (
                    <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400">No audits yet.</td></tr>
                  ) : audits.map((a) => (
                    <tr key={a.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5"><Link href={`/fixed-assets/audits/${a.id}`} className="font-mono text-xs text-zinc-700 hover:underline">{a.audit_number}</Link></td>
                      <td className="px-4 py-2.5 text-gray-600">{a.audit_year}</td>
                      <td className="px-4 py-2.5 text-gray-600">{a.started_at.slice(0, 10)}</td>
                      <td className="px-4 py-2.5"><span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_BADGE[a.status]}`}>{a.status.replace('_', ' ')}</span></td>
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
