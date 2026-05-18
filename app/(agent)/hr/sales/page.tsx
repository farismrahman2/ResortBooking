import { Topbar } from '@/components/layout/Topbar'
import { MigrationErrorBanner } from '@/components/hr/MigrationErrorBanner'
import { DateRangeBar } from './SalesClient'
import { getSalesAttribution } from '@/lib/queries/sales'
import { requirePermission } from '@/lib/auth/permissions'
import { formatBDT } from '@/lib/formatters/currency'
import { toISODate } from '@/lib/formatters/dates'
import { TrendingUp, Users, Trophy } from 'lucide-react'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: { from?: string; to?: string }
}

export default async function SalesPerformancePage({ searchParams }: PageProps) {
  await requirePermission('hr', 'read')

  const now = new Date()
  const defaultFrom = toISODate(new Date(now.getFullYear(), now.getMonth(), 1))
  const defaultTo   = toISODate(new Date(now.getFullYear(), now.getMonth() + 1, 0))
  const from = searchParams.from ?? defaultFrom
  const to   = searchParams.to   ?? defaultTo

  let migrationError: string | null = null
  let data: Awaited<ReturnType<typeof getSalesAttribution>> | null = null
  try {
    data = await getSalesAttribution({ from, to })
  } catch (err) {
    migrationError = err instanceof Error ? err.message : String(err)
  }

  const topRep  = data?.by_rep[0] ?? null
  const topTeam = data?.by_team[0] ?? null

  return (
    <div className="flex h-full flex-col">
      <Topbar title="Sales Performance" subtitle="Per-rep + per-team revenue attribution" />
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 space-y-5">
        {migrationError && <MigrationErrorBanner error={migrationError} />}

        <DateRangeBar from={from} to={to} />

        {data && (
          <>
            {/* KPI cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <KPICard
                label="Total Attributed Revenue"
                value={formatBDT(data.total_revenue - data.unattributed_revenue)}
                hint={data.unattributed_revenue > 0 ? `${formatBDT(data.unattributed_revenue)} unattributed` : undefined}
                icon={<TrendingUp size={16} />}
                accent="sky"
              />
              <KPICard
                label="Top Rep"
                value={topRep?.full_name ?? '—'}
                hint={topRep ? `${formatBDT(topRep.total_revenue)} · ${topRep.bookings_count} bookings` : 'No bookings in range'}
                icon={<Trophy size={16} />}
                accent="amber"
              />
              <KPICard
                label="Top Team"
                value={topTeam?.team_name ?? '— (no teams)'}
                hint={topTeam ? `${formatBDT(topTeam.total_revenue)} · ${topTeam.member_count} members` : undefined}
                icon={<Users size={16} />}
                accent="emerald"
              />
            </div>

            {/* Per-rep leaderboard */}
            <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
              <div className="border-b border-gray-200 bg-gray-50 px-4 py-2.5">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-600">By Rep</h3>
              </div>
              {data.by_rep.length === 0 ? (
                <p className="p-6 text-center text-sm text-gray-500">
                  No attributed bookings in this range.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[640px]">
                    <thead className="border-b border-gray-100">
                      <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
                        <th className="px-4 py-2 font-medium">Rep</th>
                        <th className="px-4 py-2 font-medium">Team</th>
                        <th className="px-4 py-2 text-right font-medium">Bookings</th>
                        <th className="px-4 py-2 text-right font-medium">Cancelled</th>
                        <th className="px-4 py-2 text-right font-medium">Revenue</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {data.by_rep.map((r) => (
                        <tr key={r.employee_id}>
                          <td className="px-4 py-2">
                            <p className="font-medium text-gray-900">{r.full_name}</p>
                            <p className="text-xs font-mono text-gray-500">{r.employee_code}</p>
                          </td>
                          <td className="px-4 py-2 text-xs text-gray-600">{r.sales_team ?? '—'}</td>
                          <td className="px-4 py-2 text-right font-mono tabular-nums">{r.bookings_count}</td>
                          <td className="px-4 py-2 text-right font-mono tabular-nums text-gray-400">{r.cancelled_count}</td>
                          <td className="px-4 py-2 text-right font-mono tabular-nums font-semibold text-sky-700">
                            {formatBDT(r.total_revenue)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Per-team rollup */}
            {data.by_team.length > 0 && (
              <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
                <div className="border-b border-gray-200 bg-gray-50 px-4 py-2.5">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-600">By Team</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[480px]">
                    <thead className="border-b border-gray-100">
                      <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
                        <th className="px-4 py-2 font-medium">Team</th>
                        <th className="px-4 py-2 text-right font-medium">Members</th>
                        <th className="px-4 py-2 text-right font-medium">Bookings</th>
                        <th className="px-4 py-2 text-right font-medium">Revenue</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {data.by_team.map((t) => (
                        <tr key={t.team_name ?? '__no_team__'}>
                          <td className="px-4 py-2 font-medium text-gray-900">
                            {t.team_name ?? <span className="italic text-gray-400">— (no team)</span>}
                          </td>
                          <td className="px-4 py-2 text-right font-mono tabular-nums">{t.member_count}</td>
                          <td className="px-4 py-2 text-right font-mono tabular-nums">{t.bookings_count}</td>
                          <td className="px-4 py-2 text-right font-mono tabular-nums font-semibold text-sky-700">
                            {formatBDT(t.total_revenue)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {data.unattributed_revenue > 0 && (
              <p className="text-xs text-gray-500 italic">
                {formatBDT(data.unattributed_revenue)} of revenue in this range had no sales rep
                assigned (legacy or untagged bookings). Edit individual bookings to attribute them.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function KPICard({
  label, value, hint, icon, accent,
}: { label: string; value: string; hint?: string; icon: React.ReactNode; accent: 'sky' | 'amber' | 'emerald' }) {
  const accentMap = {
    sky:     'bg-sky-50 border-sky-200 text-sky-900',
    amber:   'bg-amber-50 border-amber-200 text-amber-900',
    emerald: 'bg-emerald-50 border-emerald-200 text-emerald-900',
  } as const
  return (
    <div className={`rounded-xl border p-4 ${accentMap[accent]}`}>
      <p className="text-[10px] uppercase tracking-wider font-semibold opacity-70 inline-flex items-center gap-1.5">
        {icon} {label}
      </p>
      <p className="mt-1 text-xl font-bold tabular-nums truncate">{value}</p>
      {hint && <p className="mt-0.5 text-[11px] opacity-70">{hint}</p>}
    </div>
  )
}
