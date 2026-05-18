import { requirePermission, hasPermission } from '@/lib/auth/permissions'
import { buildPeriodRange } from '@/lib/reports/periods'
import { computeAvailability } from '@/lib/reports/sufficient-data'
import { getHubTotals, getHubTotalsForComparison, getRevenueSparkline } from '@/lib/queries/reports/hub'
import { ReportShell } from '@/components/reports/ReportShell'
import { KpiCard } from '@/components/reports/KpiCard'
import { InsufficientDataNote } from '@/components/reports/InsufficientDataNote'
import { ReportTile } from '@/components/reports/ReportTile'
import { REPORTS, SECTION_ORDER, SECTION_LABELS, type ReportMeta, type ReportSection } from '@/components/reports/labels'
import { formatBDTCompact } from '@/lib/reports/format'
import type { ComparisonMode, PeriodPreset } from '@/lib/reports/types'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: { period?: string; from?: string; to?: string; compare?: string }
}

const VALID_PRESETS: PeriodPreset[] = [
  'today', 'yesterday', 'this_week', 'last_week', 'this_month', 'last_month',
  'last_30_days', 'last_90_days', 'this_quarter', 'last_quarter', 'this_year', 'ytd', 'custom',
]

const VALID_MODES: ComparisonMode[] = ['off', 'previous_period', 'year_over_year', 'both']

function pickPreset(s: string | undefined): PeriodPreset {
  return VALID_PRESETS.includes(s as PeriodPreset) ? (s as PeriodPreset) : 'this_month'
}
function pickMode(s: string | undefined): ComparisonMode {
  return VALID_MODES.includes(s as ComparisonMode) ? (s as ComparisonMode) : 'off'
}

export default async function ReportsHubPage({ searchParams }: PageProps) {
  await requirePermission('reports', 'read')

  const preset = pickPreset(searchParams.period)
  const mode   = pickMode(searchParams.compare)
  const period = buildPeriodRange(preset, {
    from: searchParams.from ? new Date(searchParams.from + 'T00:00:00') : undefined,
    to:   searchParams.to   ? new Date(searchParams.to   + 'T00:00:00') : undefined,
  })

  const [current, prev, yoy, avail, hrAccess, checkoutAccess, expensesAccess, sparklineRaw] = await Promise.all([
    getHubTotals(period),
    mode === 'previous_period' || mode === 'both' ? getHubTotalsForComparison(period, 'previous_period') : Promise.resolve(null),
    mode === 'year_over_year'  || mode === 'both' ? getHubTotalsForComparison(period, 'year_over_year')  : Promise.resolve(null),
    computeAvailability(period),
    hasPermission('hr', 'read'),
    hasPermission('checkout', 'read'),
    hasPermission('expenses', 'read'),
    getRevenueSparkline(),
  ])

  const sparkline = sparklineRaw.map((d) => d.revenue)

  // Comparison fields actually rendered when sufficient data exists
  const showPrev = (mode === 'previous_period' || mode === 'both') && avail.prev.available
  const showYoy  = (mode === 'year_over_year'  || mode === 'both') && avail.yoy.available
  const effectiveMode: ComparisonMode = showPrev && showYoy ? 'both' : showPrev ? 'previous_period' : showYoy ? 'year_over_year' : 'off'

  // Group reports by section, filter to phase ≤ 1 for the hub itself (we only have hub now);
  // others are listed but greyed-out as "Coming in later phase" until shipped
  const tilesBySection: Record<ReportSection, ReportMeta[]> = {} as Record<ReportSection, ReportMeta[]>
  for (const r of REPORTS) {
    if (!tilesBySection[r.section]) tilesBySection[r.section] = []
    tilesBySection[r.section].push(r)
  }

  return (
    <ReportShell
      title="Reports"
      subtitle="Pricing, expense control, growth, and operations"
      period={period}
      preset={preset}
      customFrom={searchParams.from}
      customTo={searchParams.to}
      mode={mode}
    >
      {/* KPI strip */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Total revenue"
          value={formatBDTCompact(current.total_revenue)}
          raw={current.total_revenue}
          prior={prev?.total_revenue ?? null}
          yoy={yoy?.total_revenue ?? null}
          mode={effectiveMode}
        />
        <KpiCard
          label="Total expenses"
          value={formatBDTCompact(current.total_expenses)}
          raw={current.total_expenses}
          prior={prev?.total_expenses ?? null}
          yoy={yoy?.total_expenses ?? null}
          mode={effectiveMode}
          invertColour
        />
        <KpiCard
          label="Net"
          value={formatBDTCompact(current.net)}
          raw={current.net}
          prior={prev?.net ?? null}
          yoy={yoy?.net ?? null}
          mode={effectiveMode}
          emphasis={current.net >= 0 ? 'positive' : 'negative'}
        />
        <KpiCard
          label="Avg occupancy"
          value={current.avg_occupancy_pct == null ? '—' : `${current.avg_occupancy_pct.toFixed(1)}%`}
          raw={current.avg_occupancy_pct ?? undefined}
          prior={prev?.avg_occupancy_pct ?? null}
          yoy={yoy?.avg_occupancy_pct ?? null}
          mode={effectiveMode}
          note={current.total_rooms ? undefined : 'Set total_rooms in Settings → Property to compute'}
        />
      </div>

      {/* Comparison-availability notes */}
      {(mode === 'previous_period' || mode === 'both') && !avail.prev.available && (
        <InsufficientDataNote reason={avail.prev.reason ?? 'Comparison data not available'} />
      )}
      {(mode === 'year_over_year' || mode === 'both') && !avail.yoy.available && (
        <InsufficientDataNote reason={avail.yoy.reason ?? 'Comparison data not available'} />
      )}

      {/* Tile grid grouped by section */}
      <div className="space-y-6">
        {SECTION_ORDER.map((section) => {
          const tiles = tilesBySection[section] ?? []
          if (tiles.length === 0) return null
          return (
            <section key={section}>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">{SECTION_LABELS[section]}</h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {tiles.map((meta) => {
                  const lacksModule =
                    (meta.module === 'hr' && !hrAccess) ||
                    (meta.module === 'checkout' && !checkoutAccess) ||
                    (meta.module === 'expenses' && !expensesAccess)
                  const notYetShipped = meta.phase > 1
                  const disabled = lacksModule || notYetShipped
                  const reason = lacksModule
                    ? `${meta.module?.toUpperCase()} access required`
                    : notYetShipped
                      ? `Coming in Phase ${meta.phase}`
                      : undefined
                  return (
                    <ReportTile
                      key={meta.id}
                      meta={meta}
                      sparkline={meta.id === 'income' && !disabled ? sparkline : undefined}
                      disabled={disabled}
                      disabledReason={reason}
                    />
                  )
                })}
              </div>
            </section>
          )
        })}
      </div>
    </ReportShell>
  )
}
