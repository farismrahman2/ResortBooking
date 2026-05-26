import Link from 'next/link'
import { Topbar } from '@/components/layout/Topbar'
import { requirePermission } from '@/lib/auth/permissions'
import { listActivities, getNextStepsDue } from '@/lib/queries/crm'
import { MigrationErrorBanner } from '@/components/crm/MigrationErrorBanner'
import { ActivitiesFeed } from '@/components/crm/ActivitiesFeed'

export const dynamic = 'force-dynamic'

export default async function ActivitiesPage() {
  await requirePermission('crm', 'read')

  let migrationError: string | null = null
  let activities: Awaited<ReturnType<typeof listActivities>> = []
  let dueSoon: Awaited<ReturnType<typeof getNextStepsDue>> = []
  try {
    [activities, dueSoon] = await Promise.all([listActivities(), getNextStepsDue(7)])
  } catch (err) {
    migrationError = err instanceof Error ? err.message : String(err)
  }

  return (
    <div className="flex h-full flex-col">
      <Topbar title="Activities" subtitle="Global activity feed" />
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 space-y-5">
        {migrationError ? <MigrationErrorBanner error={migrationError} /> : (
          <>
            {dueSoon.length > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                <p className="mb-2 text-sm font-semibold text-amber-900">Follow-ups due in the next 7 days</p>
                <ul className="space-y-1 text-sm text-amber-800">
                  {dueSoon.map((a) => (
                    <li key={a.id}>
                      <span className="font-medium">{a.next_step_date}</span> — {a.next_step}
                      {a.account_name ? ` · ${a.account_name}` : ''}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <ActivitiesFeed activities={activities} />
            <Link href="/crm" className="inline-block text-sm text-amber-700 hover:underline">← Back to Corporate Sales</Link>
          </>
        )}
      </div>
    </div>
  )
}
