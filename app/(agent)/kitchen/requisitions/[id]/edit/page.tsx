import { redirect } from 'next/navigation'
import { Topbar } from '@/components/layout/Topbar'
import { requirePermission } from '@/lib/auth/permissions'
import {
  getRequisitionById, listKitchenVendors, listKitchenItems, listRequisitionsForCopy,
  listTemplates,
} from '@/lib/queries/kitchen'
import { RequisitionForm } from '@/components/kitchen/RequisitionForm'
import { MigrationErrorBanner } from '@/components/ui/MigrationErrorBanner'

export const dynamic = 'force-dynamic'

export default async function EditRequisitionPage({ params }: { params: { id: string } }) {
  await requirePermission('kitchen', 'write')
  try {
    // Two round trips and a sizeable payload — five requisitions with every
    // line, plus every template with every line — for a card that is only
    // rendered when the sheet is EMPTY. Resuming a 40-line draft was paying
    // for both and showing neither.
    const req = await getRequisitionById(params.id)
    const wantsStartingPoint = (req?.lines.length ?? 0) === 0

    const [vendors, items, recent, templates] = await Promise.all([
      listKitchenVendors(),
      listKitchenItems(),
      wantsStartingPoint ? listRequisitionsForCopy(5) : Promise.resolve([]),
      // Never fatal: a missing templates table (migration not yet run) must
      // not take down the form people order from.
      wantsStartingPoint ? listTemplates().catch(() => []) : Promise.resolve([]),
    ])
    // Once it leaves draft it has gone to the approver — read-only from here.
    if (req && req.status !== 'draft') redirect(`/kitchen/requisitions/${params.id}`)

    const parent = req?.parent_requisition_id
      ? await getRequisitionById(req.parent_requisition_id)
      : null

    return (
      <div className="flex h-full flex-col">
        <Topbar
          title={req ? req.requisition_no : 'New requisition'}
          subtitle={req?.parent_requisition_id ? 'Amendment' : 'Kitchen requisition'}
        />
        <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
          <RequisitionForm
            requisitionId={params.id}
            initial={req}
            vendors={vendors}
            items={items}
            isNew={!req}
            // Don't offer this sheet as a source for itself.
            recent={recent.filter((r) => r.id !== params.id)}
            templates={templates}
            amendmentOf={parent ? { id: parent.id, requisition_no: parent.requisition_no } : undefined}
          />
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
