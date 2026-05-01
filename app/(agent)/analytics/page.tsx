import { Topbar } from '@/components/layout/Topbar'
import { AnalyticsClient } from '@/components/analytics/AnalyticsClient'
import { UpsalesPanel } from '@/components/analytics/UpsalesPanel'
import {
  getTotalsSummary,
  getDailyRevenue,
  getPackageTypeBreakdown,
  getRoomTypeUtilization,
} from '@/lib/queries/analytics'
import { getUpsalesSummary, type UpsalesSummary } from '@/lib/queries/upsales'
import { toISODate } from '@/lib/formatters/dates'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: { from?: string; to?: string }
}

export default async function AnalyticsPage({ searchParams }: PageProps) {
  // Default range: current month
  const now = new Date()
  const defaultFrom = toISODate(new Date(now.getFullYear(), now.getMonth(), 1))
  const defaultTo   = toISODate(new Date(now.getFullYear(), now.getMonth() + 1, 0))
  const from = searchParams.from ?? defaultFrom
  const to   = searchParams.to   ?? defaultTo

  const [summary, daily, packages, rooms] = await Promise.all([
    getTotalsSummary(from, to),
    getDailyRevenue(from, to),
    getPackageTypeBreakdown(from, to),
    getRoomTypeUtilization(from, to),
  ])

  // Best-effort — if checkouts table doesn't exist yet, skip the panel.
  let upsales: UpsalesSummary | null = null
  try {
    upsales = await getUpsalesSummary({ from, to })
  } catch {
    upsales = null
  }

  return (
    <div className="flex h-full flex-col">
      <Topbar title="Analytics" subtitle="Revenue, packages, and room utilization" />
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 print:overflow-visible print:p-0 space-y-6">
        <AnalyticsClient
          from={from}
          to={to}
          summary={summary}
          daily={daily}
          packages={packages}
          rooms={rooms}
        />
        {upsales && <UpsalesPanel data={upsales} />}
      </div>
    </div>
  )
}
