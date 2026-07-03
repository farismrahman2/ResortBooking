import { Topbar } from '@/components/layout/Topbar'
import { requirePermission, hasPermission } from '@/lib/auth/permissions'
import { getPendingQaCalls, getQaReviews, getQaTrends } from '@/lib/queries/qa'
import { QaClient } from '@/components/qa/QaClient'

export const dynamic = 'force-dynamic'

export default async function QaPage() {
  await requirePermission('qa', 'read')
  const [canWrite, canViewBookings] = await Promise.all([
    hasPermission('qa', 'write'),
    hasPermission('bookings', 'read'),
  ])

  let migrationError: string | null = null
  let data: {
    pending: Awaited<ReturnType<typeof getPendingQaCalls>>
    reviews: Awaited<ReturnType<typeof getQaReviews>>
    trends:  Awaited<ReturnType<typeof getQaTrends>>
  } | null = null

  try {
    const [pending, reviews, trends] = await Promise.all([
      getPendingQaCalls(),
      getQaReviews(),
      getQaTrends(),
    ])
    data = { pending, reviews, trends }
  } catch (err) {
    migrationError = err instanceof Error ? err.message : String(err)
  }

  return (
    <div className="flex h-full flex-col">
      <Topbar title="Guest Feedback" subtitle="Post-stay QA calls & service quality tracking" />
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        {migrationError || !data ? (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
            <p className="font-semibold">Guest Feedback module not ready</p>
            <p className="mt-1">
              The database migration <code className="rounded bg-amber-100 px-1">migrations/qa-module/000_create_qa_module.sql</code>{' '}
              hasn&apos;t been applied yet. Run it in the Supabase SQL editor, then reload this page.
            </p>
            {migrationError && <p className="mt-2 font-mono text-xs text-amber-700">{migrationError}</p>}
          </div>
        ) : (
          <QaClient
            pending={data.pending}
            reviews={data.reviews}
            trends={data.trends}
            canWrite={canWrite}
            canViewBookings={canViewBookings}
          />
        )}
      </div>
    </div>
  )
}
