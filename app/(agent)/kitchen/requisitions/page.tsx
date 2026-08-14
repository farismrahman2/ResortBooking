import Link from 'next/link'
import { ClipboardList, ChevronRight, AlertTriangle, Tags } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { requirePermission, hasPermission } from '@/lib/auth/permissions'
import { listRequisitions } from '@/lib/queries/kitchen'
import { EmptyState } from '@/components/ui/EmptyState'
import { MigrationErrorBanner } from '@/components/ui/MigrationErrorBanner'
import { formatDate } from '@/lib/formatters/dates'
import { REQUISITION_STATUS_LABELS, REQUISITION_STATUS_BADGE } from '@/lib/supabase/types-kitchen'

export const dynamic = 'force-dynamic'

interface PageProps { searchParams: { status?: string } }

export default async function RequisitionsPage({ searchParams }: PageProps) {
  await requirePermission('kitchen', 'read')
  const canWrite = await hasPermission('kitchen', 'write')

  try {
    const rows = await listRequisitions({ status: searchParams.status })
    const awaiting = rows.filter((r) => r.status === 'pending_approval').length

    return (
      <div className="flex h-full flex-col">
        <Topbar
          title="Kitchen Requisitions"
          subtitle="Daily grocery orders"
          action={canWrite ? { label: 'New requisition', href: '/kitchen/requisitions/new' } : undefined}
        />
        <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
          <div className="mx-auto max-w-4xl space-y-3">
            {canWrite && (
              <Link href="/kitchen/items"
                className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-700">
                <Tags size={15} className="flex-shrink-0 text-gray-400" />
                <span className="flex-1">Item vendors — set who supplies each item</span>
                <ChevronRight size={15} className="text-gray-300" />
              </Link>
            )}
            {awaiting > 0 && (
              <Link href="/kitchen/requisitions?status=pending_approval"
                className="flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5">
                <AlertTriangle size={16} className="flex-shrink-0 text-amber-600" />
                <span className="flex-1 text-sm font-medium text-amber-900">
                  {awaiting} requisition{awaiting === 1 ? '' : 's'} awaiting approval
                </span>
                <ChevronRight size={15} className="text-amber-500" />
              </Link>
            )}

            {rows.length === 0 ? (
              <EmptyState
                icon={<ClipboardList size={26} />}
                title="No requisitions yet"
                description="Raise the day's kitchen requisition and send it to your suppliers."
                action={canWrite ? { label: 'New requisition', href: '/kitchen/requisitions/new' } : undefined}
              />
            ) : (
              <ul className="space-y-2">
                {rows.map((r) => (
                  <li key={r.id}>
                    <Link href={`/kitchen/requisitions/${r.id}`}
                      className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-3 active:bg-forest-50/40">
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="font-mono text-sm font-semibold text-gray-900">{r.requisition_no}</span>
                          {r.is_emergency && (
                            <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">
                              emergency
                            </span>
                          )}
                        </span>
                        <span className="mt-0.5 block text-xs text-gray-500">
                          For {formatDate(r.event_date)} · {r.line_count} item{r.line_count === 1 ? '' : 's'}
                          {r.vendor_count > 0 ? ` · ${r.vendor_count} vendor${r.vendor_count === 1 ? '' : 's'}` : ''}
                          {r.approver_name ? ` · approved by ${r.approver_name}` : ''}
                        </span>
                      </span>
                      <span className={`flex-shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${REQUISITION_STATUS_BADGE[r.status]}`}>
                        {REQUISITION_STATUS_LABELS[r.status]}
                      </span>
                      <ChevronRight size={15} className="flex-shrink-0 text-gray-300" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    )
  } catch (err) {
    return (
      <div className="flex h-full flex-col">
        <Topbar title="Kitchen Requisitions" />
        <div className="px-4 py-6 sm:px-6">
          <MigrationErrorBanner error={err instanceof Error ? err.message : String(err)} moduleName="Kitchen" migrationPath="migrations/kitchen-module/000_create_requisitions.sql" />
        </div>
      </div>
    )
  }
}
