import Link from 'next/link'
import { ChevronRight, Ban } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { requirePermission, hasPermission } from '@/lib/auth/permissions'
import { listPayments } from '@/lib/queries/kitchen-ledger'
import { KitchenNav } from '@/components/kitchen/KitchenNav'
import { EmptyState } from '@/components/ui/EmptyState'
import { MigrationErrorBanner } from '@/components/ui/MigrationErrorBanner'
import { formatDate } from '@/lib/formatters/dates'
import { formatBDT } from '@/lib/formatters/currency'
import { PAYMENT_METHOD_LABELS } from '@/lib/supabase/types-kitchen'

export const dynamic = 'force-dynamic'

export default async function PaymentsPage() {
  await requirePermission('kitchen', 'read')
  const canWrite = await hasPermission('kitchen', 'write')

  try {
    const payments = await listPayments()
    return (
      <div className="flex h-full flex-col">
        <Topbar
          title="Payments"
          subtitle="Cheques and cash to suppliers"
          action={canWrite ? { label: 'Record payment', href: '/kitchen/payments/new' } : undefined}
        />
        <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
          <div className="mx-auto max-w-4xl space-y-4">
            <KitchenNav current="payments" />

            {payments.length === 0 ? (
              <EmptyState
                title="No payments recorded"
                description="Record each cheque against the bills it settles, and the ledger can tell you what's still open."
                action={canWrite ? { label: 'Record a payment', href: '/kitchen/payments/new' } : undefined}
              />
            ) : (
              <ul className="space-y-2">
                {payments.map((p) => {
                  const onAccount = p.amount - p.allocated
                  return (
                    <li key={p.id}>
                      <Link
                        href={`/kitchen/payments/${p.id}`}
                        className={`flex items-center gap-3 rounded-xl border bg-white p-3 ${
                          p.status === 'cancelled' ? 'border-red-200 opacity-60' : 'border-gray-200'}`}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold text-gray-900">
                            {p.payment_no}
                            <span className="ml-1.5 text-xs font-normal text-gray-500">{p.vendor_name}</span>
                          </span>
                          <span className="block text-xs text-gray-500">
                            {formatDate(p.payment_date)} · {PAYMENT_METHOD_LABELS[p.method]}
                            {p.cheque_no ? ` #${p.cheque_no}` : ''}
                            {p.bank_name ? ` · ${p.bank_name}` : ''}
                          </span>
                        </span>
                        <span className="flex-shrink-0 text-right">
                          <span className="block text-sm font-bold text-gray-900">{formatBDT(p.amount)}</span>
                          {p.status === 'cancelled' ? (
                            <span className="inline-flex items-center gap-0.5 text-[11px] font-medium text-red-600">
                              <Ban size={10} /> cancelled
                            </span>
                          ) : onAccount > 0.009 ? (
                            <span className="block text-[11px] text-amber-600">
                              {formatBDT(onAccount)} on account
                            </span>
                          ) : null}
                        </span>
                        <ChevronRight size={16} className="flex-shrink-0 text-gray-400" />
                      </Link>
                    </li>
                  )
                })}
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
