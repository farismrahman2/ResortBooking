import Link from 'next/link'
import { notFound } from 'next/navigation'
import { format } from 'date-fns'
import { Pencil, Ban, ArrowLeft, AlertTriangle } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { Button } from '@/components/ui/Button'
import { requirePermission, hasPermission } from '@/lib/auth/permissions'
import { getCoffeeShopSaleById } from '@/lib/queries/coffee-shop'
import { isStillSameDayInDhaka } from '@/lib/coffee-shop/timezone'
import { PAYMENT_METHOD_LABELS, PAYMENT_METHOD_BADGE, STATUS_BADGE } from '@/components/coffee-shop/labels'
import { VoidSaleButton } from '@/components/coffee-shop/VoidSaleButton'
import { formatBDT } from '@/lib/formatters/currency'

export const dynamic = 'force-dynamic'

interface PageProps { params: { id: string } }

export default async function CoffeeShopSaleDetailPage({ params }: PageProps) {
  await requirePermission('coffee_shop', 'read')
  const canWrite = await hasPermission('coffee_shop', 'write')
  const sale = await getCoffeeShopSaleById(params.id)
  if (!sale) notFound()

  const stillEditable = canWrite && sale.status === 'completed' && isStillSameDayInDhaka(sale.sale_date)

  return (
    <div className="flex h-full flex-col">
      <Topbar title={`Sale ${sale.sale_number}`} subtitle={sale.customer_label ?? '—'} />
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 space-y-4">
        <Link href="/coffee-shop/sales" className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-stone-700">
          <ArrowLeft size={14} /> Back to sales
        </Link>

        {sale.status === 'voided' && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
            <p className="font-semibold inline-flex items-center gap-2"><AlertTriangle size={14} /> Voided</p>
            {sale.void_reason && <p className="mt-1 text-xs italic">Reason: &ldquo;{sale.void_reason}&rdquo;</p>}
          </div>
        )}

        {!stillEditable && sale.status === 'completed' && (
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-xs text-gray-600">
            Sales are locked after their date — only same-day edits are allowed.
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
          <div className="space-y-4">
            <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-2">
              <div className="flex items-baseline justify-between">
                <h3 className="text-sm font-semibold text-gray-900">Sale info</h3>
                <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${STATUS_BADGE[sale.status]}`}>
                  {sale.status === 'voided' ? 'Voided' : 'Completed'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-700">
                <div><span className="text-gray-500">Date:</span> {format(new Date(sale.sale_date + 'T00:00:00'), 'EEE d MMM yyyy')}</div>
                <div><span className="text-gray-500">Created:</span> {format(new Date(sale.created_at), 'd MMM yyyy, h:mm a')}</div>
                {sale.notes && <div className="col-span-2"><span className="text-gray-500">Notes:</span> {sale.notes}</div>}
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
              <div className="border-b border-gray-100 px-4 py-2.5">
                <h3 className="text-sm font-semibold text-gray-900">Items ({sale.items.length})</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[520px]">
                  <thead className="bg-gray-50">
                    <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
                      <th className="px-3 py-2 font-medium">Item</th>
                      <th className="px-3 py-2 text-right font-medium">Qty</th>
                      <th className="px-3 py-2 text-right font-medium">Unit</th>
                      <th className="px-3 py-2 text-right font-medium">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {sale.items.map((it) => (
                      <tr key={it.id} className={it.is_complimentary ? 'bg-amber-50/30' : ''}>
                        <td className="px-3 py-2 text-gray-900">
                          {it.description}
                          {it.is_complimentary && (
                            <p className="text-[10px] text-amber-700">🎁 Complimentary — {it.comp_reason}</p>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{Number(it.quantity)}</td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums text-gray-700">{formatBDT(Number(it.unit_price))}</td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums font-semibold">
                          {it.is_complimentary ? <span className="text-gray-400">comp</span> : formatBDT(Number(it.amount))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <h3 className="text-sm font-semibold text-gray-900 mb-2">Payments</h3>
              <ul className="space-y-1.5">
                {sale.payments.map((p) => (
                  <li key={p.id} className="flex items-center justify-between text-sm">
                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${PAYMENT_METHOD_BADGE[p.method]}`}>
                      {PAYMENT_METHOD_LABELS[p.method]}
                    </span>
                    {p.reference && <span className="text-xs text-gray-500 font-mono mx-2 truncate">{p.reference}</span>}
                    <span className="font-mono tabular-nums font-semibold ml-auto">{formatBDT(Number(p.amount))}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="lg:sticky lg:top-4 lg:self-start space-y-3">
            <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-2">
              <h3 className="text-sm font-semibold text-gray-900 mb-1">Bill summary</h3>
              <Row label="Subtotal" value={formatBDT(Number(sale.subtotal))} />
              {Number(sale.comp_value) > 0 && <Row label="Comp value (info)" value={formatBDT(Number(sale.comp_value))} muted />}
              {Number(sale.discount_amount) > 0 && (
                <Row label={`Discount${sale.discount_type === 'percent' ? ` (${Number(sale.discount_value)}%)` : ''}`}
                  value={`− ${formatBDT(Number(sale.discount_amount))}`} tone="amber" />
              )}
              {sale.discount_reason && <p className="text-[10px] italic text-amber-700">&ldquo;{sale.discount_reason}&rdquo;</p>}
              <div className="border-t border-gray-200 pt-2">
                <Row label="Net" value={formatBDT(Number(sale.net_amount))} bold large />
              </div>
            </div>

            {stillEditable && (
              <>
                <Link href={`/coffee-shop/sales/${sale.id}/edit`}>
                  <Button type="button" variant="outline" size="md" className="w-full gap-1.5">
                    <Pencil size={14} /> Edit sale
                  </Button>
                </Link>
                <VoidSaleButton saleId={sale.id} />
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function Row({ label, value, bold, large, muted, tone }: {
  label: string; value: string; bold?: boolean; large?: boolean; muted?: boolean; tone?: 'amber'
}) {
  const cls = [
    'flex justify-between items-baseline tabular-nums',
    large ? 'text-base' : 'text-sm',
    muted ? 'text-gray-500' : 'text-gray-900',
    tone === 'amber' ? 'text-amber-800' : '',
    bold ? 'font-semibold' : '',
  ].filter(Boolean).join(' ')
  return <div className={cls}><span>{label}</span><span className="font-mono">{value}</span></div>
}
