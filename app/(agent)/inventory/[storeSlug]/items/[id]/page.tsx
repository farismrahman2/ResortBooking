import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Topbar } from '@/components/layout/Topbar'
import { requirePermission, hasPermission } from '@/lib/auth/permissions'
import { getItemById } from '@/lib/queries/inventory'
import { ITEM_TYPE_LABELS, formatQty } from '@/components/inventory/labels'
import { formatBDT } from '@/lib/formatters/currency'

export const dynamic = 'force-dynamic'

export default async function ItemDetailPage({ params }: { params: { storeSlug: string; id: string } }) {
  await requirePermission('inventory', 'read')
  const canWrite = await hasPermission('inventory', 'write')

  const item = await getItemById(params.id)
  if (!item) notFound()

  return (
    <div className="flex h-full flex-col">
      <Topbar
        title={item.name}
        subtitle={`${item.sku_code} · ${item.category?.display_name ?? ''}`}
        action={canWrite ? { label: 'Edit', href: `/inventory/${params.storeSlug}/items/${item.id}/edit` } : undefined}
      />
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        <div className="mx-auto max-w-2xl space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Field label="In stock" value={formatQty(item.current_stock, item.unit?.abbreviation)} emphasis={item.isBelowReorder} />
            <Field label="Par level" value={item.par_level != null ? formatQty(item.par_level, item.unit?.abbreviation) : '—'} />
            <Field label="Reorder point" value={item.reorder_point != null ? formatQty(item.reorder_point, item.unit?.abbreviation) : '—'} />
            <Field label="Avg cost" value={item.avg_purchase_price != null ? formatBDT(item.avg_purchase_price) : '—'} />
            <Field label="Last cost" value={item.last_purchase_price != null ? formatBDT(item.last_purchase_price) : '—'} />
            <Field label="Type" value={ITEM_TYPE_LABELS[item.item_type]} />
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-5 text-sm">
            <Row label="Store"    value={item.store?.display_name ?? '—'} />
            <Row label="Unit"     value={item.unit ? `${item.unit.display_name} (${item.unit.abbreviation})` : '—'} />
            <Row label="Supplier" value={item.supplier?.name ?? '—'} />
            <Row label="Negative stock" value={item.allow_negative_stock ? 'Allowed' : 'Blocked'} />
            {item.description && <Row label="Description" value={item.description} />}
            {item.notes && <Row label="Notes" value={item.notes} />}
          </div>

          <p className="text-xs text-gray-400">
            Stock movements (receipts, issues, transfers, adjustments) arrive in Phase 2.
          </p>
          <Link href={`/inventory/${params.storeSlug}`} className="text-sm text-teal-700 hover:underline">
            ← Back to {item.store?.display_name ?? 'store'}
          </Link>
        </div>
      </div>
    </div>
  )
}

function Field({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      <p className={`mt-1 text-lg font-bold tabular-nums ${emphasis ? 'text-red-700' : 'text-gray-900'}`}>{value}</p>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-gray-100 py-2 last:border-0">
      <span className="text-gray-500">{label}</span>
      <span className="text-right font-medium text-gray-900">{value}</span>
    </div>
  )
}
