import { redirect } from 'next/navigation'
import { Topbar } from '@/components/layout/Topbar'
import { LsPage } from '@/components/landscaping/LsNav'
import { RecordPaymentForm } from '@/components/landscaping/RecordPaymentForm'
import { requirePermission } from '@/lib/auth/permissions'
import { getLsMe, listSuppliers } from '@/lib/queries/landscaping'
import { approvedForPayment } from '@/lib/queries/landscaping-payments'

export const dynamic = 'force-dynamic'

/** Upload an approved requisition's payment with its slips. */
export default async function NewPaymentRecordPage({ searchParams }: { searchParams: { req?: string } }) {
  await requirePermission('landscaping', 'write')
  const me = await getLsMe()
  if (!me?.can_pay) redirect('/landscaping/payments')
  const [requisitions, suppliers] = await Promise.all([approvedForPayment(), listSuppliers()])
  return (
    <div className="flex h-full flex-col">
      <Topbar title="Upload payment" subtitle="Approved requisition · requisition slip · payment slip" />
      <LsPage tab="payments">
        <RecordPaymentForm requisitions={requisitions} suppliers={suppliers.map((s) => ({ id: s.id, name: s.name }))} initialReqId={searchParams.req} />
      </LsPage>
    </div>
  )
}
