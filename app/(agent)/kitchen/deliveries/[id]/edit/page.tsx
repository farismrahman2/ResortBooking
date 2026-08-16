import { redirect } from 'next/navigation'
import { Topbar } from '@/components/layout/Topbar'
import { requirePermission } from '@/lib/auth/permissions'
import {
  listKitchenVendors, listKitchenItems, getRequisitionById, listApprovers,
} from '@/lib/queries/kitchen'
import {
  getDeliveryById, buildDeliveryLinesFromRequisition,
} from '@/lib/queries/kitchen-ledger'
import { listKitchenDocuments } from '@/lib/queries/kitchen-docs'
import { DeliveryForm } from '@/components/kitchen/DeliveryForm'
import { DocumentCapture } from '@/components/kitchen/DocumentCapture'
import { MigrationErrorBanner } from '@/components/ui/MigrationErrorBanner'

export const dynamic = 'force-dynamic'

export default async function EditDeliveryPage({
  params, searchParams,
}: {
  params: { id: string }
  searchParams: { requisition?: string; vendor?: string }
}) {
  await requirePermission('kitchen', 'write')
  try {
    const [existing, vendors, items, employees, docs] = await Promise.all([
      getDeliveryById(params.id),
      listKitchenVendors(),
      listKitchenItems(),
      listApprovers().catch(() => []),
      listKitchenDocuments('delivery', params.id).catch(() => []),
    ])
    // Confirmed means the supplier has been billed — read-only from here.
    if (existing && existing.status !== 'draft') redirect(`/kitchen/deliveries/${params.id}`)

    // Pre-fill only on a genuinely new delivery. Re-deriving it for a draft
    // already on the server would overwrite corrections somebody has typed.
    const reqId = searchParams.requisition
    const vendorId = searchParams.vendor
    const [prefill, req] = !existing && reqId && vendorId
      ? await Promise.all([
          buildDeliveryLinesFromRequisition(reqId, vendorId),
          getRequisitionById(reqId),
        ])
      : [undefined, null]

    return (
      <div className="flex h-full flex-col">
        <Topbar
          title={existing ? existing.delivery_no : 'New delivery'}
          subtitle={req ? `Against ${req.requisition_no}` : 'Goods received'}
        />
        <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
          <DeliveryForm
            deliveryId={params.id}
            initial={existing}
            vendors={vendors}
            items={items}
            employees={employees}
            prefill={prefill}
            isNew={!existing}
            requisitionNo={req?.requisition_no ?? null}
            requisitionId={existing ? null : (reqId ?? null)}
            defaultVendorId={existing ? null : (vendorId ?? null)}
            receiptCapture={
              /* Rendered right under the memo fields: photograph the
                 supplier's receipt-book page as proof at the moment the memo
                 number is typed. The delivery id is minted in the URL, so
                 photos taken before the first autosave still attach to the
                 right delivery. */
              <DocumentCapture
                entityType="delivery" entityId={params.id} docs={docs}
                kind="receipt" label="Receipt photos (proof of the memo)"
                hint="Photograph the supplier's receipt book page — when their total is questioned later, this photo settles it."
                editable
              />
            }
          />
        </div>
      </div>
    )
  } catch (err) {
    if (err && typeof err === 'object' && 'digest' in err) throw err
    return (
      <div className="px-4 py-6">
        <MigrationErrorBanner
          error={err instanceof Error ? err.message : String(err)}
          moduleName="Kitchen"
          migrationPath="migrations/kitchen-module/003_phase2_deliveries_payments.sql"
        />
      </div>
    )
  }
}
