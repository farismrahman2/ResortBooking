import { requirePermission } from '@/lib/auth/permissions'
import { resolvePeriod } from '@/lib/reports/page-params'
import {
  getGuestReport, getGuestTotalsForComparison, type GuestDayRow,
} from '@/lib/queries/reports/guests'
import { ReportShell } from '@/components/reports/ReportShell'
import { KpiCard } from '@/components/reports/KpiCard'
import { SimpleTable } from '@/components/reports/SimpleTable'
import { formatDateShort } from '@/lib/formatters/dates'
import type { ComparisonMode } from '@/lib/reports/types'

export const dynamic = 'force-dynamic'

interface PageProps { searchParams: { period?: string; from?: string; to?: string; compare?: string } }

/**
 * Guest numbers over any period — how many people the resort served, counted
 * by arrival date, with the daylong/night split and a day-by-day table.
 * Booked counts; cancellations and no-shows excluded.
 */
export default async function GuestsReportPage({ searchParams }: PageProps) {
  await requirePermission('reports', 'read')
  const { preset, period, mode, customFrom, customTo } = resolvePeriod(searchParams)

  const [{ totals, daily }, prev, yoy] = await Promise.all([
    getGuestReport(period),
    mode === 'previous_period' || mode === 'both'
      ? getGuestTotalsForComparison(period, 'previous_period') : Promise.resolve(null),
    mode === 'year_over_year' || mode === 'both'
      ? getGuestTotalsForComparison(period, 'year_over_year') : Promise.resolve(null),
  ])
  const effectiveMode: ComparisonMode = mode

  const days = daily.length || 1
  const busiest = daily.reduce<GuestDayRow | null>(
    (best, d) => (d.guests > (best?.guests ?? 0) ? d : best), null)

  return (
    <ReportShell
      title="Guest Numbers"
      subtitle="People served, by arrival date — cancellations and no-shows excluded"
      period={period} preset={preset} customFrom={customFrom} customTo={customTo} mode={mode}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KpiCard
          label="Guests"
          value={totals.guests.toLocaleString('en-IN')}
          raw={totals.guests} prior={prev?.guests ?? null} yoy={yoy?.guests ?? null}
          mode={effectiveMode}
          note="adults + children"
        />
        <KpiCard
          label="Bookings"
          value={totals.bookings.toLocaleString('en-IN')}
          raw={totals.bookings} prior={prev?.bookings ?? null} yoy={yoy?.bookings ?? null}
          mode={effectiveMode}
        />
        <KpiCard
          label="Avg guests / day"
          value={(totals.guests / days).toFixed(1)}
          raw={totals.guests / days}
          prior={prev ? prev.guests / days : null}
          yoy={yoy ? yoy.guests / days : null}
          mode={effectiveMode}
        />
        <KpiCard
          label="Adults"
          value={totals.adults.toLocaleString('en-IN')}
          raw={totals.adults} prior={prev?.adults ?? null} yoy={yoy?.adults ?? null}
          mode={effectiveMode}
        />
        <KpiCard
          label="Children"
          value={(totals.children_paid + totals.children_free).toLocaleString('en-IN')}
          raw={totals.children_paid + totals.children_free}
          prior={prev ? prev.children_paid + prev.children_free : null}
          yoy={yoy ? yoy.children_paid + yoy.children_free : null}
          mode={effectiveMode}
          note={`${totals.children_paid.toLocaleString('en-IN')} paid · ${totals.children_free.toLocaleString('en-IN')} free`}
        />
        <KpiCard
          label="Drivers"
          value={totals.drivers.toLocaleString('en-IN')}
          raw={totals.drivers} prior={prev?.drivers ?? null} yoy={yoy?.drivers ?? null}
          mode={effectiveMode}
          note="on top of guests"
        />
      </div>

      {/* Daylong vs night split */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Daylong</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-gray-900">
            {totals.daylong_guests.toLocaleString('en-IN')} <span className="text-sm font-normal text-gray-500">guests</span>
          </p>
          <p className="text-xs text-gray-500">
            {totals.daylong_bookings.toLocaleString('en-IN')} bookings
            {totals.guests > 0 && ` · ${Math.round((totals.daylong_guests / totals.guests) * 100)}% of guests`}
          </p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Night stays</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-gray-900">
            {totals.night_guests.toLocaleString('en-IN')} <span className="text-sm font-normal text-gray-500">guests</span>
          </p>
          <p className="text-xs text-gray-500">
            {totals.night_bookings.toLocaleString('en-IN')} bookings
            {totals.guests > 0 && ` · ${Math.round((totals.night_guests / totals.guests) * 100)}% of guests`}
          </p>
        </div>
      </div>

      {busiest && busiest.guests > 0 && (
        <p className="rounded-xl border border-forest-200 bg-forest-50/50 px-4 py-3 text-sm text-forest-900">
          Busiest day: <strong>{formatDateShort(busiest.date)}</strong> —{' '}
          {busiest.guests.toLocaleString('en-IN')} guests across {busiest.bookings} booking{busiest.bookings === 1 ? '' : 's'}.
        </p>
      )}

      <SimpleTable<GuestDayRow>
        rows={daily}
        columns={[
          { key: 'date',     label: 'Date', render: (r) => formatDateShort(r.date) },
          { key: 'bookings', label: 'Bookings', align: 'right' },
          { key: 'adults',   label: 'Adults',   align: 'right' },
          { key: 'children', label: 'Children', align: 'right' },
          { key: 'drivers',  label: 'Drivers',  align: 'right' },
          { key: 'guests',   label: 'Guests',   align: 'right',
            render: (r) => <strong>{r.guests.toLocaleString('en-IN')}</strong> },
        ]}
        totals={{
          date:     'Total',
          bookings: totals.bookings.toLocaleString('en-IN'),
          adults:   totals.adults.toLocaleString('en-IN'),
          children: (totals.children_paid + totals.children_free).toLocaleString('en-IN'),
          drivers:  totals.drivers.toLocaleString('en-IN'),
          guests:   <strong>{totals.guests.toLocaleString('en-IN')}</strong>,
        }}
      />
    </ReportShell>
  )
}
