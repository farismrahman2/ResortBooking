import dynamic_ from 'next/dynamic'
import { Topbar } from '@/components/layout/Topbar'
import { UpsalesPanel } from '@/components/analytics/UpsalesPanel'

// Defer recharts to a route-specific async chunk so it never ships on
// non-analytics pages. ssr:false isn't allowed from a server component in
// Next 14 — leaving SSR on is fine since the component is already 'use client'.
const AnalyticsClient = dynamic_(
  () => import('@/components/analytics/AnalyticsClient').then(m => m.AnalyticsClient),
  { loading: () => <div className="p-8 text-sm text-slate-500">Loading charts…</div> },
)
import {
  getTotalsSummary,
  getDailyRevenue,
  getPackageTypeBreakdown,
  getRoomTypeUtilization,
} from '@/lib/queries/analytics'
import { getUpsalesSummary, type UpsalesSummary } from '@/lib/queries/upsales'
import { todayDhaka, monthStartDhaka } from '@/lib/dates'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: { from?: string; to?: string }
}

export default async function AnalyticsPage({ searchParams }: PageProps) {
  // Default range: current month on the RESORT's calendar (UTC is a day behind
  // Asia/Dhaka until 6am local).
  const today = todayDhaka()
  const [ty, tm] = today.split('-').map(Number)
  const from = searchParams.from ?? monthStartDhaka(today)
  const to   = searchParams.to   ?? new Date(Date.UTC(ty, tm, 0)).toISOString().slice(0, 10)

  // All five independent — one parallel round (upsales stays best-effort:
  // the checkout module may not be migrated yet).
  const [summary, daily, packages, rooms, upsales] = await Promise.all([
    getTotalsSummary(from, to),
    getDailyRevenue(from, to),
    getPackageTypeBreakdown(from, to),
    getRoomTypeUtilization(from, to),
    getUpsalesSummary({ from, to }).catch(() => null as UpsalesSummary | null),
  ])

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
