import Link from 'next/link'
import { Topbar } from '@/components/layout/Topbar'
import { KpiTrackerGrid } from '@/components/crm/KpiTrackerGrid'
import type { KpiTracker } from '@/lib/queries/crm'

export function KpiView({ tracker }: { tracker: KpiTracker }) {
  return (
    <div className="flex h-full flex-col">
      <Topbar title="KPI Tracker" subtitle={tracker.userName ?? undefined} />
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 space-y-4">
        {!tracker.salesStartDate ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            No sales start date set for this user — pro-rated targets can&apos;t be computed. Set it on the user&apos;s settings page.
          </div>
        ) : (
          <p className="text-sm text-gray-500">Day 1: {tracker.salesStartDate}</p>
        )}
        <KpiTrackerGrid tracker={tracker} />
        <Link href="/crm" className="inline-block text-sm text-amber-700 hover:underline">← Back to Corporate Sales</Link>
      </div>
    </div>
  )
}
