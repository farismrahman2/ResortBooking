import { notFound } from 'next/navigation'
import { requirePermission } from '@/lib/auth/permissions'
import { getRequisitionById, getVendorSections, listApprovers } from '@/lib/queries/kitchen'
import { RequisitionPrintDoc } from '@/components/kitchen/RequisitionPrintDoc'
import { MigrationErrorBanner } from '@/components/ui/MigrationErrorBanner'
import { formatDate } from '@/lib/formatters/dates'
import { REQUISITION_STATUS_LABELS } from '@/lib/supabase/types-kitchen'

export const dynamic = 'force-dynamic'

/**
 * The printable sheet — one A4 page, every item, grouped by supplier.
 *
 * Reachable at any status so a draft can be checked on paper before it goes
 * out, but a draft prints under a watermark: an unapproved list must not be
 * mistaken for an approved one in a kitchen where both are on the same clipboard.
 */
export default async function RequisitionPrintPage({ params }: { params: { id: string } }) {
  await requirePermission('kitchen', 'read')

  try {
    const [req, sections, employees] = await Promise.all([
      getRequisitionById(params.id),
      getVendorSections(params.id),
      listApprovers().catch(() => []),
    ])
    if (!req) notFound()

    const approverName = req.approved_by_employee_id
      ? employees.find((e) => e.id === req.approved_by_employee_id)?.full_name ?? null
      : null

    return (
      <RequisitionPrintDoc
        header={{
          id:             req.id,
          requisition_no: req.requisition_no,
          event_date:     formatDate(req.event_date),
          // created_at is a full timestamp; formatDate appends 'T00:00:00' to
          // whatever it is handed, so give it the date half only.
          raised_on:      formatDate(req.created_at.slice(0, 10)),
          status:         req.status,
          statusLabel:    REQUISITION_STATUS_LABELS[req.status],
          isEmergency:    req.is_emergency,
          approverName,
          notes:          req.notes,
        }}
        sections={sections}
      />
    )
  } catch (err) {
    if (err && typeof err === 'object' && 'digest' in err) throw err
    return (
      <div className="px-4 py-6">
        <MigrationErrorBanner
          error={err instanceof Error ? err.message : String(err)}
          moduleName="Kitchen"
          migrationPath="migrations/kitchen-module/000_create_requisitions.sql"
        />
      </div>
    )
  }
}
