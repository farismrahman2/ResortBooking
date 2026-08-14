import { Topbar } from '@/components/layout/Topbar'
import { requirePermission } from '@/lib/auth/permissions'
import { listKitchenVendors } from '@/lib/queries/kitchen'
import { listDeliveries } from '@/lib/queries/kitchen-ledger'
import { PaymentForm } from '@/components/kitchen/PaymentForm'
import { MigrationErrorBanner } from '@/components/ui/MigrationErrorBanner'

export const dynamic = 'force-dynamic'

export default async function NewPaymentPage({
  searchParams,
}: {
  searchParams: { vendor?: string }
}) {
  await requirePermission('kitchen', 'write')
  try {
    const [vendors, openBills] = await Promise.all([
      listKitchenVendors(),
      listDeliveries({ unpaidOnly: true }),
    ])
    return (
      <div className="flex h-full flex-col">
        <Topbar title="Record a payment" subtitle="And what it settles" />
        <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
          <PaymentForm
            vendors={vendors}
            openBills={openBills}
            defaultVendorId={searchParams.vendor}
          />
        </div>
      </div>
    )
  } catch (err) {
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
