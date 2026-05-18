import { Topbar } from '@/components/layout/Topbar'
import { AuditLogClient } from '@/components/settings/AuditLogClient'
import { listAdminAlerts } from '@/lib/queries/admin-alerts'
import { requirePermission } from '@/lib/auth/permissions'
import type { AdminAlertEvent } from '@/lib/supabase/types'

export const dynamic = 'force-dynamic'

const VALID_FILTERS = [
  'unread', 'all',
  'discount_applied', 'guest_reduced', 'checkout_voided',
  'refund_recorded', 'booking_cancelled', 'user_deactivated',
] as const

interface PageProps {
  searchParams: { filter?: string }
}

export default async function AuditLogPage({ searchParams }: PageProps) {
  await requirePermission('settings', 'read')
  const filter = (VALID_FILTERS as readonly string[]).includes(searchParams.filter ?? '')
    ? (searchParams.filter as 'unread' | 'all' | AdminAlertEvent)
    : 'unread'

  let alerts: Awaited<ReturnType<typeof listAdminAlerts>> = []
  let migrationError: string | null = null
  try {
    alerts = await listAdminAlerts({ filter })
  } catch (err) {
    migrationError = err instanceof Error ? err.message : String(err)
  }

  return (
    <div className="flex h-full flex-col">
      <Topbar
        title="Audit Log"
        subtitle="Discounts, guest reductions, voids, refunds, and other flagged events"
      />
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        <div className="mx-auto max-w-4xl space-y-4">
          {migrationError && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
              <strong>admin_alerts table missing.</strong> Run{' '}
              <code>migrations/checkout-module/001_add_discount_and_alerts.sql</code> in Supabase first.
              <details className="mt-2"><summary className="cursor-pointer">Error</summary>
                <pre className="mt-1 font-mono whitespace-pre-wrap text-red-700">{migrationError}</pre>
              </details>
            </div>
          )}
          <AuditLogClient alerts={alerts} filter={filter} />
        </div>
      </div>
    </div>
  )
}
