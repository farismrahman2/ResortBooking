import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Pencil, Send } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { requirePermission, hasPermission } from '@/lib/auth/permissions'
import { getRequisitionById, listKitchenVendors, getVendorSections } from '@/lib/queries/kitchen'
import { listSalesEmployees } from '@/lib/queries/employees'
import { ApprovePanel } from '@/components/kitchen/ApprovePanel'
import { MigrationErrorBanner } from '@/components/ui/MigrationErrorBanner'
import { formatDate } from '@/lib/formatters/dates'
import { REQUISITION_STATUS_LABELS, REQUISITION_STATUS_BADGE } from '@/lib/supabase/types-kitchen'
import { num } from '@/lib/kitchen/messages'
import type { SalesEmployee } from '@/lib/supabase/types'

export const dynamic = 'force-dynamic'

export default async function RequisitionDetailPage({ params }: { params: { id: string } }) {
  await requirePermission('kitchen', 'read')
  const canWrite = await hasPermission('kitchen', 'write')

  try {
    const [req, sections, employees] = await Promise.all([
      getRequisitionById(params.id),
      getVendorSections(params.id),
      listSalesEmployees().catch(() => [] as SalesEmployee[]),
    ])
    if (!req) notFound()

    const approver = req.approved_by_employee_id
      ? employees.find((e) => e.id === req.approved_by_employee_id)?.full_name ?? null
      : null

    return (
      <div className="flex h-full flex-col">
        <Topbar title={req.requisition_no} subtitle={`For ${formatDate(req.event_date)}`} />
        <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
          <div className="mx-auto max-w-5xl space-y-4">

            <div className="flex flex-wrap items-center gap-2">
              <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${REQUISITION_STATUS_BADGE[req.status]}`}>
                {REQUISITION_STATUS_LABELS[req.status]}
              </span>
              {req.is_emergency && (
                <span className="inline-flex rounded-full border border-red-300 bg-red-50 px-2.5 py-0.5 text-xs font-semibold text-red-700">
                  Emergency
                </span>
              )}
              <div className="ml-auto flex gap-2">
                {canWrite && req.status === 'draft' && (
                  <Link href={`/kitchen/requisitions/${req.id}/edit`}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700">
                    <Pencil size={12} /> Edit
                  </Link>
                )}
                <Link href={`/kitchen/requisitions/${req.id}/dispatch`}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700">
                  <Send size={12} /> Supplier messages
                </Link>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              <div className="space-y-4 lg:col-span-2">
                {sections.filter((s) => s.lines.length > 0).map((s) => (
                  <div key={s.vendor.id} className={`overflow-hidden rounded-xl border bg-white ${
                    s.vendor.slug === '_untagged' ? 'border-red-300' : 'border-gray-200'}`}>
                    <p className={`border-b px-4 py-2 text-xs font-semibold uppercase tracking-wide ${
                      s.vendor.slug === '_untagged'
                        ? 'border-red-200 bg-red-50 text-red-800'
                        : 'border-gray-200 bg-gray-50 text-gray-600'}`}>
                      {s.vendor.display_name} · {s.lines.length}
                    </p>
                    <ul className="divide-y divide-gray-100">
                      {s.lines.map((l, i) => (
                        <li key={i} className="flex items-center justify-between gap-3 px-4 py-2">
                          <span className="min-w-0 flex-1 truncate text-sm text-gray-900">
                            {l.item_name}
                            {l.is_extra && (
                              <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">extra</span>
                            )}
                          </span>
                          <span className="flex-shrink-0 font-mono text-sm text-gray-800">
                            {num(l.qty)}{l.unit_label ? ` ${l.unit_label}` : ''}
                            {l.piece_count ? ` (${num(l.piece_count)} pcs)` : ''}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
                {req.notes && (
                  <div className="rounded-xl border border-gray-200 bg-white p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Notes</p>
                    <p className="mt-1 text-sm text-gray-800">{req.notes}</p>
                  </div>
                )}
              </div>

              <div className="space-y-4">
                <ApprovePanel
                  requisitionId={req.id}
                  status={req.status}
                  employees={employees}
                  approverName={approver}
                  canWrite={canWrite}
                />
              </div>
            </div>

            <Link href="/kitchen/requisitions" className="inline-block text-sm text-forest-700 hover:underline">
              ← All requisitions
            </Link>
          </div>
        </div>
      </div>
    )
  } catch (err) {
    if (err && typeof err === 'object' && 'digest' in err) throw err
    return (
      <div className="px-4 py-6">
        <MigrationErrorBanner error={err instanceof Error ? err.message : String(err)} moduleName="Kitchen" migrationPath="migrations/kitchen-module/000_create_requisitions.sql" />
      </div>
    )
  }
}
