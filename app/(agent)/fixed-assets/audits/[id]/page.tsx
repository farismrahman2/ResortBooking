import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Topbar } from '@/components/layout/Topbar'
import { requirePermission } from '@/lib/auth/permissions'
import { getAuditById, listLocations } from '@/lib/queries/fixed-assets'
import { AuditSheet } from '@/components/fixed-assets/AuditSheet'

export const dynamic = 'force-dynamic'

export default async function AuditDetailPage({ params }: { params: { id: string } }) {
  await requirePermission('fixed_assets', 'read')
  const [audit, locations] = await Promise.all([getAuditById(params.id), listLocations()])
  if (!audit) notFound()

  const missing = audit.lines.filter((l) => l.found === false).length
  const moved = audit.lines.filter((l) => l.found === true && l.found_at_location_id && l.found_at_location_id !== l.expected_location_id).length

  return (
    <div className="flex h-full flex-col">
      <Topbar title={audit.audit_number} subtitle={`${audit.audit_year} · ${audit.status.replace('_', ' ')}`} />
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 space-y-4">
        <div className="flex flex-wrap gap-2 text-sm">
          <span className="rounded-lg bg-gray-100 px-3 py-1.5">Assets: <b>{audit.lines.length}</b></span>
          <span className="rounded-lg bg-red-50 px-3 py-1.5 text-red-700">Missing: <b>{missing}</b></span>
          <span className="rounded-lg bg-amber-50 px-3 py-1.5 text-amber-700">Moved: <b>{moved}</b></span>
        </div>
        <AuditSheet audit={audit} locations={locations} />
        <Link href="/fixed-assets/audits" className="inline-block text-sm text-zinc-700 hover:underline">← Back to audits</Link>
      </div>
    </div>
  )
}
