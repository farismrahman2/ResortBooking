import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Pencil, ChevronLeft, Ban } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { requirePermission, hasPermission, isAdmin } from '@/lib/auth/permissions'
import { getPaymentById } from '@/lib/queries/kitchen-ledger'
import { listKitchenVendors } from '@/lib/queries/kitchen'
import { listKitchenDocuments } from '@/lib/queries/kitchen-docs'
import { CancelPaymentButton } from '@/components/kitchen/CancelPaymentButton'
import { AdminDeleteButton } from '@/components/kitchen/AdminDeleteButton'
import { DocumentCapture } from '@/components/kitchen/DocumentCapture'
import { formatDate } from '@/lib/formatters/dates'
import { formatBDT } from '@/lib/formatters/currency'
import { PAYMENT_METHOD_LABELS } from '@/lib/supabase/types-kitchen'

export const dynamic = 'force-dynamic'

export default async function PaymentDetailPage({ params }: { params: { id: string } }) {
  await requirePermission('kitchen', 'read')
  const [canWrite, admin] = await Promise.all([
    hasPermission('kitchen', 'write'),
    isAdmin(),
  ])

  const [payment, vendors, docs] = await Promise.all([
    getPaymentById(params.id),
    listKitchenVendors(),
    listKitchenDocuments('payment', params.id),
  ])
  if (!payment) notFound()

  const vendor = vendors.find((v) => v.id === payment.kitchen_vendor_id)
  const allocated = payment.allocations.reduce((n, a) => n + a.amount_allocated, 0)
  const onAccount = payment.amount - allocated

  return (
    <div className="flex h-full flex-col">
      <Topbar
        title={payment.payment_no}
        subtitle={`${vendor?.display_name ?? 'Supplier'} · ${formatDate(payment.payment_date)}`}
      />
      <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
        <div className="mx-auto max-w-3xl space-y-4">

          {payment.status === 'cancelled' && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              <p className="flex items-center gap-1.5 font-semibold"><Ban size={14} /> Cancelled</p>
              {payment.cancel_reason && <p className="mt-0.5 text-xs">{payment.cancel_reason}</p>}
              <p className="mt-1 text-xs">
                It no longer counts toward anything the supplier is owed, but the record stays —
                a cheque that was written and voided is exactly what someone needs to find when
                the bank statement doesn&apos;t match.
              </p>
            </div>
          )}

          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <p className="text-3xl font-bold text-gray-900">{formatBDT(payment.amount)}</p>
            <p className="mt-1 text-sm text-gray-600">
              {PAYMENT_METHOD_LABELS[payment.method]}
              {payment.cheque_no ? ` #${payment.cheque_no}` : ''}
              {payment.bank_name ? ` · ${payment.bank_name}` : ''}
              {payment.cheque_date ? ` · dated ${formatDate(payment.cheque_date)}` : ''}
            </p>
            {payment.notes && <p className="mt-2 text-sm text-gray-700">{payment.notes}</p>}
            {canWrite && payment.status !== 'cancelled' && (
              <Link
                href={`/kitchen/payments/${payment.id}/edit`}
                className="mt-3 inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-gray-300 px-3 text-xs font-medium text-gray-700"
              >
                <Pencil size={12} /> Edit
              </Link>
            )}
          </div>

          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
            <p className="border-b border-gray-200 bg-gray-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-gray-600">
              Settles
            </p>
            {payment.allocations.length === 0 ? (
              <p className="px-4 py-5 text-center text-sm text-gray-500">
                Nothing specific — the whole amount sits on account.
              </p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {payment.allocations.map((a) => (
                  <li key={a.id}>
                    <Link
                      href={`/kitchen/deliveries/${a.delivery_id}`}
                      className="flex items-center justify-between gap-3 px-4 py-2.5"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm text-gray-900">{a.delivery_no}</span>
                        <span className="block text-xs text-gray-500">
                          {a.delivery_date ? formatDate(a.delivery_date) : ''} · bill {formatBDT(a.total_amount)}
                        </span>
                      </span>
                      <span className="flex-shrink-0 font-mono text-sm font-semibold">
                        {formatBDT(a.amount_allocated)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <div className="space-y-1 border-t border-gray-200 bg-gray-50 px-4 py-2.5 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Allocated</span>
                <span className="font-semibold">{formatBDT(allocated)}</span>
              </div>
              {onAccount > 0.009 && (
                <div className="flex justify-between">
                  <span className="text-gray-600">On account</span>
                  <span className="font-semibold text-amber-700">{formatBDT(onAccount)}</span>
                </div>
              )}
            </div>
          </div>

          <DocumentCapture
            entityType="payment" entityId={payment.id} docs={docs}
            kind="cheque" label="Cheque photo"
            hint="Photograph the cheque or counterfoil before it leaves. The number alone reconciles the statement; the picture settles what was handed over."
            editable={canWrite}
          />

          {canWrite && payment.status !== 'cancelled' && (
            <CancelPaymentButton paymentId={payment.id} />
          )}

          {admin && (
            <AdminDeleteButton kind="payment" id={payment.id} recordNo={payment.payment_no} />
          )}

          <Link href="/kitchen/payments" className="inline-flex items-center gap-1 text-sm text-forest-700 hover:underline">
            <ChevronLeft size={15} /> All payments
          </Link>
        </div>
      </div>
    </div>
  )
}
