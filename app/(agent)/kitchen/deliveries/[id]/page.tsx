import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Pencil, ChevronLeft, Ban, Wallet } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { requirePermission, hasPermission } from '@/lib/auth/permissions'
import { getDeliveryById, listDeliveries } from '@/lib/queries/kitchen-ledger'
import { listKitchenVendors, getUnitLabels, getRequisitionById } from '@/lib/queries/kitchen'
import { listSalesEmployees } from '@/lib/queries/employees'
import { listKitchenDocuments } from '@/lib/queries/kitchen-docs'
import { BillMessage } from '@/components/kitchen/BillMessage'
import { DocumentCapture } from '@/components/kitchen/DocumentCapture'
import { CancelDeliveryButton } from '@/components/kitchen/CancelDeliveryButton'
import { MigrationErrorBanner } from '@/components/ui/MigrationErrorBanner'
import { formatDate } from '@/lib/formatters/dates'
import { formatBDT } from '@/lib/formatters/currency'
import { num } from '@/lib/kitchen/messages'
import { DELIVERY_STATUS_LABELS, DELIVERY_STATUS_BADGE } from '@/lib/supabase/types-kitchen'
import type { SalesEmployee } from '@/lib/supabase/types'

export const dynamic = 'force-dynamic'

export default async function DeliveryDetailPage({ params }: { params: { id: string } }) {
  await requirePermission('kitchen', 'read')
  const canWrite = await hasPermission('kitchen', 'write')

  try {
    const [del, vendors, unitLabels, employees] = await Promise.all([
      getDeliveryById(params.id),
      listKitchenVendors(),
      getUnitLabels(),
      listSalesEmployees().catch(() => [] as SalesEmployee[]),
    ])
    if (!del) notFound()

    const [req, rows, docs] = await Promise.all([
      del.requisition_id ? getRequisitionById(del.requisition_id) : Promise.resolve(null),
      // The list row carries what has been paid against this delivery; the
      // detail query deliberately doesn't re-derive it in a second place.
      // Pass this delivery's own status, or a cancelled one drops out of its
      // own detail page and shows a fabricated zero balance.
      listDeliveries({ vendorId: del.kitchen_vendor_id, status: del.status }),
      listKitchenDocuments('delivery', del.id),
    ])
    const row = rows.find((r) => r.id === del.id)

    const vendor   = vendors.find((v) => v.id === del.kitchen_vendor_id)
    const receiver = del.received_by_employee_id
      ? employees.find((e) => e.id === del.received_by_employee_id)?.full_name ?? null
      : null

    // Billed lines exclude what was sent back — you pay for what you kept.
    const priced = del.lines
      .filter((l) => l.qty_delivered > 0)
      .map((l) => ({
        item_name:   l.item_name,
        qty:         l.qty_delivered,
        piece_count: l.piece_count,
        unit_label:  l.unit_id ? (unitLabels[l.unit_id] ?? null) : null,
        rate:        l.unit_price,
        amount:      l.line_total,
      }))
    const rejected = del.lines
      .filter((l) => (l.rejected_qty ?? 0) > 0)
      .map((l) => ({ item_name: l.item_name, qty: l.rejected_qty as number, reason: l.reject_reason }))

    return (
      <div className="flex h-full flex-col">
        <Topbar title={del.delivery_no} subtitle={`${vendor?.display_name ?? 'Supplier'} · ${formatDate(del.delivery_date)}`} />
        <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
          <div className="mx-auto max-w-4xl space-y-4">

            <div className="flex flex-wrap items-center gap-2">
              <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${DELIVERY_STATUS_BADGE[del.status]}`}>
                {DELIVERY_STATUS_LABELS[del.status]}
              </span>
              {req && (
                <Link href={`/kitchen/requisitions/${req.id}`}
                  className="inline-flex rounded-full border border-gray-300 bg-white px-2.5 py-0.5 text-xs font-medium text-gray-700">
                  {req.requisition_no}
                </Link>
              )}
              {del.supplier_memo_no && (
                <span className="text-xs text-gray-500">Memo {del.supplier_memo_no}</span>
              )}
              <div className="ml-auto flex gap-2">
                {canWrite && del.status === 'draft' && (
                  <Link href={`/kitchen/deliveries/${del.id}/edit`}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700">
                    <Pencil size={12} /> Edit
                  </Link>
                )}
                {canWrite && del.status === 'confirmed' && (row?.outstanding ?? 0) > 0 && (
                  <Link href={`/kitchen/payments/new?vendor=${del.kitchen_vendor_id}`}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-forest-700 px-3 py-1.5 text-xs font-semibold text-white">
                    <Wallet size={12} /> Pay
                  </Link>
                )}
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              <div className="space-y-4 lg:col-span-2">
                <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 bg-gray-50 text-left text-[11px] uppercase tracking-wide text-gray-500">
                        <th className="px-3 py-2 font-semibold">Item</th>
                        <th className="px-2 py-2 text-right font-semibold">Ordered</th>
                        <th className="px-2 py-2 text-right font-semibold">Got</th>
                        <th className="px-2 py-2 text-right font-semibold">Rate</th>
                        <th className="px-3 py-2 text-right font-semibold">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {del.lines.map((l) => {
                        const short = l.qty_ordered !== null && l.qty_delivered < l.qty_ordered
                        return (
                          <tr key={l.id} className={l.is_unrequested ? 'bg-amber-50/40' : undefined}>
                            <td className="px-3 py-2">
                              {l.item_name}
                              {l.is_unrequested && (
                                <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                                  not ordered
                                </span>
                              )}
                            </td>
                            <td className="px-2 py-2 text-right font-mono text-xs text-gray-500">
                              {l.qty_ordered === null ? '—' : num(l.qty_ordered)}
                            </td>
                            <td className={`px-2 py-2 text-right font-mono ${short ? 'font-semibold text-amber-700' : ''}`}>
                              {num(l.qty_delivered)}
                            </td>
                            <td className="px-2 py-2 text-right font-mono text-xs">{num(l.unit_price)}</td>
                            <td className="px-3 py-2 text-right font-mono">{formatBDT(l.line_total)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-gray-200 bg-gray-50">
                        <td colSpan={4} className="px-3 py-2 text-right text-sm font-medium text-gray-700">Total</td>
                        <td className="px-3 py-2 text-right text-base font-bold">{formatBDT(del.total_amount)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {del.status === 'confirmed' && (
                  <BillMessage
                    receiptNo={del.supplier_memo_no || del.delivery_no}
                    supplyDate={del.delivery_date}
                    eventDate={req?.event_date ?? del.delivery_date}
                    requisitionNo={req?.requisition_no ?? '—'}
                    isEmergency={req?.is_emergency}
                    lines={priced}
                    template={vendor?.bill_template ?? null}
                    rejected={rejected}
                  />
                )}

                <DocumentCapture
                  entityType="delivery" entityId={del.id} docs={docs}
                  kind="receipt" label="Receipt photos"
                  hint="Photograph the supplier's receipt book page. When a total is queried a fortnight later, this is what settles it."
                  editable={canWrite}
                />

                {del.notes && (
                  <div className="rounded-xl border border-gray-200 bg-white p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Notes</p>
                    <p className="mt-1 text-sm text-gray-800">{del.notes}</p>
                  </div>
                )}
              </div>

              <div className="space-y-4">
                <div className="space-y-2 rounded-xl border border-gray-200 bg-white p-4 text-sm">
                  <div className="flex justify-between"><span className="text-gray-500">Bill</span><span className="font-semibold">{formatBDT(del.total_amount)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Paid</span><span>{formatBDT(row?.paid_amount ?? 0)}</span></div>
                  <div className="flex justify-between border-t border-gray-200 pt-2">
                    <span className="font-medium text-gray-700">Outstanding</span>
                    <span className={`font-bold ${(row?.outstanding ?? 0) > 0 ? 'text-red-700' : 'text-green-700'}`}>
                      {formatBDT(row?.outstanding ?? 0)}
                    </span>
                  </div>
                  {receiver && (
                    <p className="border-t border-gray-200 pt-2 text-xs text-gray-500">
                      Received by {receiver}
                    </p>
                  )}
                </div>

                {del.status === 'cancelled' && del.cancel_reason && (
                  <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                    <p className="flex items-center gap-1.5 font-semibold"><Ban size={14} /> Cancelled</p>
                    <p className="mt-0.5 text-xs">{del.cancel_reason}</p>
                  </div>
                )}

                {canWrite && del.status !== 'cancelled' && (
                  <CancelDeliveryButton deliveryId={del.id} />
                )}
              </div>
            </div>

            <Link href="/kitchen/deliveries" className="inline-flex items-center gap-1 text-sm text-forest-700 hover:underline">
              <ChevronLeft size={15} /> All deliveries
            </Link>
          </div>
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
