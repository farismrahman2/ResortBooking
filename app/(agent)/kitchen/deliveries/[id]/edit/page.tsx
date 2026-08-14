import { redirect } from 'next/navigation'
import { Topbar } from '@/components/layout/Topbar'
import { requirePermission } from '@/lib/auth/permissions'
import { listKitchenVendors, listKitchenItems, getRequisitionById } from '@/lib/queries/kitchen'
import {
  getDeliveryById, buildDeliveryLinesFromRequisition,
} from '@/lib/queries/kitchen-ledger'
import { listSalesEmployees } from '@/lib/queries/employees'
import { DeliveryForm } from '@/components/kitchen/DeliveryForm'
import { MigrationErrorBanner } from '@/components/ui/MigrationErrorBanner'
import type { SalesEmployee } from '@/lib/supabase/types'

export const dynamic = 'force-dynamic'

export default async function EditDeliveryPage({
  params, searchParams,
}: {
  params: { id: string }
  searchParams: { requisition?: string; vendor?: string }
}) {
  await requirePermission('kitchen', 'write')
  try {
    const [existing, vendors, items, employees] = await Promise.all([
      getDeliveryById(params.id),
      listKitchenVendors(),
      listKitchenItems(),
      listSalesEmployees().catch(() => [] as SalesEmployee[]),
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
