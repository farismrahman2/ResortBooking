import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { requirePermission } from '@/lib/auth/permissions'
import { getRequisitionById, getVendorSections, getDispatchStatus } from '@/lib/queries/kitchen'
import { VendorDispatch } from '@/components/kitchen/VendorDispatch'
import { formatDate } from '@/lib/formatters/dates'

export const dynamic = 'force-dynamic'

export default async function DispatchPage({ params }: { params: { id: string } }) {
  await requirePermission('kitchen', 'read')
  const [req, sections, dispatched] = await Promise.all([
    getRequisitionById(params.id),
    getVendorSections(params.id),
    getDispatchStatus(params.id),
  ])
  if (!req) notFound()

  // An amendment carries only the changes, so it needs the parent's number to
  // say WHICH order is being changed — a delta with no anchor is unreadable.
  const parent = req.parent_requisition_id
    ? await getRequisitionById(req.parent_requisition_id)
    : null

  return (
    <div className="flex h-full flex-col">
      <Topbar title={`Send ${req.requisition_no}`} subtitle={`For ${formatDate(req.event_date)}`} />
      <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
        <div className="mx-auto max-w-[720px] space-y-4">
          <Link href={`/kitchen/requisitions/${req.id}`}
            className="inline-flex items-center gap-1 text-sm text-forest-700 hover:underline">
            <ChevronLeft size={15} /> Back to requisition
          </Link>

          {req.status !== 'approved' && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
              This requisition isn&apos;t approved yet. You can preview the messages, but wait for
              approval before sending them to suppliers.
            </div>
          )}

          <VendorDispatch
            requisition={req}
            sections={sections}
            requisitionId={req.id}
            dispatched={dispatched}
            amendmentOf={parent
              ? { parentRequisitionNo: parent.requisition_no, amendmentNo: req.requisition_no }
              : undefined}
          />
        </div>
      </div>
    </div>
  )
}
