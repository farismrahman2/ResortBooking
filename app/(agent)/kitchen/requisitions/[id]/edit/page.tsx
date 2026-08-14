import { redirect } from 'next/navigation'
import { Topbar } from '@/components/layout/Topbar'
import { requirePermission } from '@/lib/auth/permissions'
import {
  getRequisitionById, listKitchenVendors, listKitchenItems, listRequisitionsForCopy,
} from '@/lib/queries/kitchen'
import { RequisitionForm } from '@/components/kitchen/RequisitionForm'
import { MigrationErrorBanner } from '@/components/ui/MigrationErrorBanner'

export const dynamic = 'force-dynamic'

export default async function EditRequisitionPage({ params }: { params: { id: string } }) {
  await requirePermission('kitchen', 'write')
  try {
    const [req, vendors, items, recent] = await Promise.all([
      getRequisitionById(params.id),
      listKitchenVendors(),
      listKitchenItems(),
      listRequisitionsForCopy(5),
    ])
    // Once it leaves draft it has gone to the approver — read-only from here.
    if (req && req.status !== 'draft') redirect(`/kitchen/requisitions/${params.id}`)

    return (
      <div className="flex h-full flex-col">
        <Topbar
          title={req ? req.requisition_no : 'New requisition'}
          subtitle="Kitchen requisition"
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
