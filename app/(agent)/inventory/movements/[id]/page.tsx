import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Topbar } from '@/components/layout/Topbar'
import { requirePermission, hasPermission } from '@/lib/auth/permissions'
import { getMovementById } from '@/lib/queries/inventory'
import { LinkedExpenseBadge } from '@/components/inventory/LinkedExpenseBadge'
import { VoidMovementButton } from '@/components/inventory/VoidMovementButton'
import { formatQty } from '@/components/inventory/labels'
import { formatBDT } from '@/lib/formatters/currency'

export const dynamic = 'force-dynamic'

export default async function MovementDetailPage({ params }: { params: { id: string } }) {
  await requirePermission('inventory', 'read')
  const canWrite = await hasPermission('inventory', 'write')

  const m = await getMovementById(params.id)
  if (!m) notFound()

  return (
    <div className="flex h-full flex-col">
      <Topbar title={m.movement_number} subtitle={`${m.movement_type} · ${m.movement_date}`} />
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        <div className="mx-auto max-w-2xl space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium capitalize text-gray-700">{m.movement_type}</span>
            {m.status === 'voided'
              ? <span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700">Voided{m.void_reason ? ` — ${m.void_reason}` : ''}</span>
              : <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">Completed</span>}
            {m.movement_type === 'receipt' && m.expense_id && <LinkedExpenseBadge amount={m.total_value} />}
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-5 text-sm">
            <Row label="Store" value={m.store?.display_name ?? '—'} />
            {m.to_store && <Row label="To store" value={m.to_store.display_name} />}
            {m.supplier && <Row label="Supplier" value={m.supplier.name} />}
            {m.invoice_number && <Row label="Invoice #" value={m.invoice_number} />}
            {m.issued_to_department && <Row label="Department" value={m.issued_to_department} />}
            {m.adjustment_reason && <Row label="Reason" value={m.adjustment_reason} />}
            {m.movement_type === 'receipt' && <Row label="Total value" value={formatBDT(m.total_value)} />}
            {m.notes && <Row label="Notes" value={m.notes} />}
          </div>

          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="min-w-full text-sm">
              <thead className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Item</th>
                  <th className="px-4 py-2 font-medium text-right">Qty</th>
                  {m.movement_type === 'receipt' && <th className="px-4 py-2 font-medium text-right">Unit price</th>}
                  {m.movement_type === 'receipt' && <th className="px-4 py-2 font-medium text-right">Line value</th>}
                  {m.movement_type === 'adjustment' && <th className="px-4 py-2 font-medium">Direction</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {m.lines.map((l) => (
                  <tr key={l.id}>
                    <td className="px-4 py-2">
                      <span className="font-medium text-gray-900">{l.item.name}</span>
                      <span className="ml-1 font-mono text-xs text-gray-400">{l.item.sku_code}</span>
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">{formatQty(l.quantity, l.item.unit_abbr)}</td>
                    {m.movement_type === 'receipt' && <td className="px-4 py-2 text-right tabular-nums">{formatBDT(l.unit_price)}</td>}
                    {m.movement_type === 'receipt' && <td className="px-4 py-2 text-right tabular-nums">{formatBDT(l.line_value)}</td>}
                    {m.movement_type === 'adjustment' && <td className="px-4 py-2 capitalize text-gray-600">{l.adjustment_direction}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {canWrite && m.status === 'completed' && (
            <VoidMovementButton movementId={m.id} hasExpense={!!m.expense_id} />
          )}

          <Link href="/inventory/movements" className="inline-block text-sm text-teal-700 hover:underline">← Back to movements</Link>
        </div>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-gray-100 py-2 capitalize last:border-0">
      <span className="text-gray-500">{label}</span>
      <span className="text-right font-medium text-gray-900">{value}</span>
    </div>
  )
}
