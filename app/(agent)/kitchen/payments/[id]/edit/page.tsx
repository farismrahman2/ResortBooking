import { notFound, redirect } from 'next/navigation'
import { Topbar } from '@/components/layout/Topbar'
import { requirePermission } from '@/lib/auth/permissions'
import { listKitchenVendors } from '@/lib/queries/kitchen'
import { listDeliveries, getPaymentById } from '@/lib/queries/kitchen-ledger'
import { PaymentForm } from '@/components/kitchen/PaymentForm'

export const dynamic = 'force-dynamic'

export default async function EditPaymentPage({ params }: { params: { id: string } }) {
  await requirePermission('kitchen', 'write')
  const [payment, vendors, vendorDeliveries] = await Promise.all([
    getPaymentById(params.id),
    listKitchenVendors(),
    // One fetch, scoped to this payment's supplier. Previously two calls — the
    // unpaid list across every vendor, then the same table again for this one.
    listDeliveries({}),
  ])
  if (!payment) notFound()

  const unpaid = vendorDeliveries.filter(
    (d) => d.status === 'confirmed' && d.outstanding > 0.009,
  )
  if (payment.status === 'cancelled') redirect(`/kitchen/payments/${params.id}`)

  // The bills this payment ALREADY settles no longer look outstanding, so
  // they'd vanish from the picker and the amounts would silently drop off on
  // save. Merge them back in at their pre-payment balance.
  // The real rows keep the supplier's receipt number and requisition —
  // hand-building the shape dropped both, and this is the one screen where the
  // tally is done by receipt number.
  const byId = new Map(vendorDeliveries.map((d) => [d.id, d]))

  const settled = payment.allocations.map((a) => {
    const full = byId.get(a.delivery_id)
    return {
      ...(full ?? {}),
      id: a.delivery_id,
      delivery_no: a.delivery_no,
      delivery_date: a.delivery_date,
      kitchen_vendor_id: payment.kitchen_vendor_id,
      total_amount: a.total_amount,
      // This payment's own allocation is what it can be re-spread over.
      outstanding: (full?.outstanding ?? 0) + a.amount_allocated,
    }
  }) as unknown as Awaited<ReturnType<typeof listDeliveries>>

  const merged = [...unpaid.filter((u) => !settled.some((s) => s.id === u.id)), ...settled]

  return (
    <div className="flex h-full flex-col">
      <Topbar title={payment.payment_no} subtitle="Edit payment" />
      <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
        <PaymentForm
          vendors={vendors}
          openBills={merged}
          initial={payment}
          paymentId={payment.id}
        />
      </div>
    </div>
  )
}
