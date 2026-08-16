import Link from 'next/link'
import { ChevronRight, PackageCheck, AlertCircle } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { requirePermission, hasPermission } from '@/lib/auth/permissions'
import { listDeliveries, listRequisitionsAwaitingDelivery } from '@/lib/queries/kitchen-ledger'
import { listKitchenVendors } from '@/lib/queries/kitchen'
import { KitchenNav } from '@/components/kitchen/KitchenNav'
import { EmptyState } from '@/components/ui/EmptyState'
import { MigrationErrorBanner } from '@/components/ui/MigrationErrorBanner'
import { formatDate } from '@/lib/formatters/dates'
import { formatBDT } from '@/lib/formatters/currency'
import { DELIVERY_STATUS_LABELS, DELIVERY_STATUS_BADGE } from '@/lib/supabase/types-kitchen'

export const dynamic = 'force-dynamic'

export default async function DeliveriesPage({
  searchParams,
}: {
  searchParams: { vendor?: string; unpaid?: string }
}) {
  await requirePermission('kitchen', 'read')
  const canWrite = await hasPermission('kitchen', 'write')

  try {
    const [deliveries, awaiting, vendors] = await Promise.all([
      listDeliveries({
        vendorId:   searchParams.vendor,
        unpaidOnly: searchParams.unpaid === '1',
      }),
      listRequisitionsAwaitingDelivery(),
      listKitchenVendors(),
    ])
    const vendorName = new Map(vendors.map((v) => [v.id, v.display_name]))

    return (
      <div className="flex h-full flex-col">
        <Topbar
          title="Deliveries"
          subtitle="What arrived, and what it cost"
          action={canWrite ? { label: 'New delivery', href: '/kitchen/deliveries/new' } : undefined}
        />
        <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
          <div className="mx-auto max-w-4xl space-y-4">
            <KitchenNav current="deliveries" />

            {/* Approved orders that haven't been received yet. This is the
                prompt that keeps deliveries recorded at all — nobody comes
                looking for this screen at 6am unless something points at it. */}
            {canWrite && awaiting.length > 0 && (
              <div className="rounded-xl border border-forest-200 bg-forest-50/50 p-3">
                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-forest-800">
                  <PackageCheck size={13} /> Receive against an order
                </p>
                <ul className="mt-2 space-y-1.5">
                  {awaiting.slice(0, 4).map((r) => (
                    <li key={r.id} className="rounded-lg border border-gray-200 bg-white p-2">
                      <p className="text-sm font-medium text-gray-900">
                        {r.requisition_no}
                        <span className="ml-1.5 text-xs font-normal text-gray-500">
                          {formatDate(r.event_date)}
                        </span>
                      </p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {r.vendors.map((v) => (
                          <Link
                            key={v}
                            href={`/kitchen/deliveries/new?requisition=${r.id}&vendor=${v}`}
                            className="inline-flex min-h-[34px] items-center rounded-lg border border-forest-300 bg-white px-2.5 text-xs font-medium text-forest-800"
                          >
                            {vendorName.get(v) ?? 'Vendor'}
                          </Link>
                        ))}
                        {/* A half-finished draft continues — starting a second
                            delivery for the same vendor would find its lines
                            already claimed and arrive empty. */}
                        {r.drafts.map((d) => (
                          <Link
                            key={d.vendor_id}
                            href={`/kitchen/deliveries/${d.delivery_id}/edit`}
                            className="inline-flex min-h-[34px] items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-2.5 text-xs font-medium text-amber-800"
                          >
                            {vendorName.get(d.vendor_id) ?? 'Vendor'}
                            <span className="font-normal text-amber-600">· finish {d.delivery_no}</span>
                          </Link>
                        ))}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <Link
                href="/kitchen/deliveries"
                className={`inline-flex min-h-[38px] items-center rounded-lg border px-3 text-xs font-medium ${
                  !searchParams.unpaid && !searchParams.vendor
                    ? 'border-forest-500 bg-forest-50 text-forest-800'
                    : 'border-gray-300 bg-white text-gray-700'}`}
              >
                All
              </Link>
              <Link
                href="/kitchen/deliveries?unpaid=1"
                className={`inline-flex min-h-[38px] items-center gap-1 rounded-lg border px-3 text-xs font-medium ${
                  searchParams.unpaid === '1'
                    ? 'border-amber-500 bg-amber-50 text-amber-800'
                    : 'border-gray-300 bg-white text-gray-700'}`}
              >
                <AlertCircle size={12} /> Unpaid
              </Link>
              {vendors.map((v) => (
                <Link
                  key={v.id}
                  href={`/kitchen/deliveries?vendor=${v.id}`}
                  className={`inline-flex min-h-[38px] items-center rounded-lg border px-3 text-xs font-medium ${
                    searchParams.vendor === v.id
                      ? 'border-forest-500 bg-forest-50 text-forest-800'
                      : 'border-gray-300 bg-white text-gray-700'}`}
                >
                  {v.display_name}
                </Link>
              ))}
            </div>

            {deliveries.length === 0 ? (
              <EmptyState
                title="No deliveries recorded"
                description="Record what arrives and the module can tell you what each supplier is owed."
              />
            ) : (
              <ul className="space-y-2">
                {deliveries.map((d) => (
                  <li key={d.id}>
                    <Link
                      href={`/kitchen/deliveries/${d.id}`}
                      className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-3"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-gray-900">
                          {d.delivery_no}
                          <span className="ml-1.5 text-xs font-normal text-gray-500">{d.vendor_name}</span>
                        </span>
                        <span className="block text-xs text-gray-500">
                          {formatDate(d.delivery_date)}
                          {d.requisition_no ? ` · ${d.requisition_no}` : ''}
                          {d.receiver_name ? ` · ${d.receiver_name}` : ''}
                        </span>
                      </span>
                      <span className="flex-shrink-0 text-right">
                        <span className="block text-sm font-bold text-gray-900">{formatBDT(d.total_amount)}</span>
                        {d.status === 'confirmed' && (
                          <span className={`block text-[11px] font-medium ${d.outstanding > 0 ? 'text-red-600' : 'text-green-600'}`}>
                            {d.outstanding > 0 ? `${formatBDT(d.outstanding)} due` : 'paid'}
                          </span>
                        )}
                      </span>
                      <span className={`flex-shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${DELIVERY_STATUS_BADGE[d.status]}`}>
                        {DELIVERY_STATUS_LABELS[d.status]}
                      </span>
                      <ChevronRight size={16} className="flex-shrink-0 text-gray-400" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
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
