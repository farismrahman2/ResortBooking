import Link from 'next/link'
import { requirePermission } from '@/lib/auth/permissions'
import { Topbar } from '@/components/layout/Topbar'
import { formatBDT } from '@/lib/formatters/currency'
import { formatDate } from '@/lib/formatters/dates'
import {
  computeCorporateDailySummary,
  getCorporateSnapshot,
  listCorporateSnapshots,
  todayDhaka,
  shiftDhakaDate,
  type CorporateDailySummary,
} from '@/lib/queries/reports/corporate-daily'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: { date?: string }
}

export default async function CorporateSummaryReport({ searchParams }: PageProps) {
  await requirePermission('reports', 'read')

  const today = todayDhaka()
  const yesterday = shiftDhakaDate(today, -1)
  const date = searchParams.date && /^\d{4}-\d{2}-\d{2}$/.test(searchParams.date)
    ? searchParams.date
    : today

  // Prefer the archived snapshot (the "report made everyday"); fall back to a
  // live computation for days the scheduled job hasn't captured yet (e.g. today).
  const snapshot = await getCorporateSnapshot(date)
  const summary: CorporateDailySummary = snapshot?.summary ?? await computeCorporateDailySummary(date)
  const source = snapshot ? 'archived' : 'live'

  const archive = await listCorporateSnapshots(30)

  return (
    <div className="flex h-full flex-col">
      <Topbar title="Corporate summary" subtitle={`${formatDate(date)} · everything corporate, in one place`} />
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 space-y-6">

        {/* Date controls */}
        <div className="flex flex-wrap items-center gap-3">
          <DateLink label="Today" date={today} active={date === today} />
          <DateLink label="Yesterday" date={yesterday} active={date === yesterday} />
          <form action="/reports/corporate" method="get" className="flex items-center gap-2">
            <label className="text-xs text-gray-500">Pick a date:</label>
            <input type="date" name="date" defaultValue={date} max={today}
              className="rounded-lg border border-gray-300 px-2 py-1 text-sm focus:border-forest-600 focus:outline-none" />
            <button className="rounded-md bg-gray-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-gray-700">Go</button>
          </form>
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
            source === 'archived' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
          }`}>
            {source === 'archived' ? 'Archived snapshot' : 'Live (not yet archived)'}
          </span>
        </div>

        {/* Headline KPIs */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi label="Corporate bookings" value={String(summary.corporate_bookings)} />
          <Kpi label="Corporate revenue" value={formatBDT(summary.corporate_revenue)} emphasis />
          <Kpi label="Collected" value={formatBDT(summary.collected)} />
          <Kpi label="Outstanding dues" value={formatBDT(summary.outstanding)} danger={summary.outstanding > 0} />
          <Kpi label="Companies" value={String(summary.companies_count)} />
          <Kpi label="Opportunities won" value={`${summary.opportunities_won} · ${formatBDT(summary.opportunities_won_value)}`} />
          <Kpi label="Quotes raised" value={`${summary.corporate_quotes} · ${formatBDT(summary.corporate_quotes_value)}`} />
          <Kpi label="Open pipeline (weighted)" value={formatBDT(summary.open_pipeline_weighted)} />
        </div>

        {/* Corporate vs retail */}
        <Section title="Corporate vs retail — bookings confirmed this day">
          <table className="min-w-full text-sm">
            <thead className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-2.5 font-medium">Segment</th>
                <th className="px-4 py-2.5 font-medium text-right">Bookings</th>
                <th className="px-4 py-2.5 font-medium text-right">Revenue</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              <tr>
                <td className="px-4 py-2 font-medium">Corporate</td>
                <td className="px-4 py-2 text-right tabular-nums">{summary.corp_vs_retail.corporate.bookings}</td>
                <td className="px-4 py-2 text-right tabular-nums">{formatBDT(summary.corp_vs_retail.corporate.revenue)}</td>
              </tr>
              <tr>
                <td className="px-4 py-2 font-medium">Retail</td>
                <td className="px-4 py-2 text-right tabular-nums">{summary.corp_vs_retail.retail.bookings}</td>
                <td className="px-4 py-2 text-right tabular-nums">{formatBDT(summary.corp_vs_retail.retail.revenue)}</td>
              </tr>
            </tbody>
          </table>
        </Section>

        {/* By company */}
        <Section title="By company">
          {summary.by_company.length === 0 ? (
            <Empty>No corporate bookings confirmed on this day.</Empty>
          ) : (
            <table className="min-w-full text-sm">
              <thead className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Company</th>
                  <th className="px-4 py-2.5 font-medium text-right">Bookings</th>
                  <th className="px-4 py-2.5 font-medium text-right">Revenue</th>
                  <th className="px-4 py-2.5 font-medium text-right">Collected</th>
                  <th className="px-4 py-2.5 font-medium text-right">Outstanding</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {summary.by_company.map((c) => (
                  <tr key={c.company}>
                    <td className="px-4 py-2 font-medium">{c.company}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{c.bookings}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{formatBDT(c.revenue)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{formatBDT(c.collected)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{formatBDT(c.outstanding)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>

        {/* CRM activity */}
        <Section title="CRM activity logged this day">
          {summary.activities_by_type.length === 0 ? (
            <Empty>No CRM activities logged on this day.</Empty>
          ) : (
            <table className="min-w-full text-sm">
              <thead className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Activity type</th>
                  <th className="px-4 py-2.5 font-medium text-right">Count</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {summary.activities_by_type.map((a) => (
                  <tr key={a.type}>
                    <td className="px-4 py-2 font-medium capitalize">{a.type.replace(/_/g, ' ')}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{a.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>

        {/* Archive — past daily snapshots */}
        <Section title="Daily archive">
          {archive.length === 0 ? (
            <Empty>
              No snapshots archived yet. A snapshot is captured automatically each night once the
              scheduled job runs (requires <code className="font-mono">CRON_SECRET</code> set in Vercel).
              You can still view any day above — it computes live.
            </Empty>
          ) : (
            <table className="min-w-full text-sm">
              <thead className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Date</th>
                  <th className="px-4 py-2.5 font-medium text-right">Bookings</th>
                  <th className="px-4 py-2.5 font-medium text-right">Revenue</th>
                  <th className="px-4 py-2.5 font-medium text-right">Outstanding</th>
                  <th className="px-4 py-2.5 font-medium text-right">Companies</th>
                  <th className="px-4 py-2.5 font-medium text-right">Opps won</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {archive.map((r) => (
                  <tr key={r.date} className={r.date === date ? 'bg-forest-50' : ''}>
                    <td className="px-4 py-2">
                      <Link href={`/reports/corporate?date=${r.date}`} className="font-medium text-forest-700 hover:underline">
                        {formatDate(r.date)}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">{r.corporate_bookings}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{formatBDT(r.corporate_revenue)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{formatBDT(r.outstanding)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{r.companies_count}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{r.opportunities_won}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>

        <p className="text-xs text-gray-400">
          Money metrics cover corporate bookings <strong>confirmed or checked-out</strong> on the selected day
          (cancelled, draft and no-show are excluded). Revenue is the booked total; outstanding is the booking&apos;s
          recorded balance (final checkout settlement may differ). Days are Asia/Dhaka calendar dates.
        </p>
        <Link href="/reports" className="inline-block text-sm text-forest-700 hover:underline">← Back to Reports</Link>
      </div>
    </div>
  )
}

function DateLink({ label, date, active }: { label: string; date: string; active: boolean }) {
  return (
    <Link href={`/reports/corporate?date=${date}`}
      className={`rounded-full px-3 py-1 text-sm ${active ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
      {label}
    </Link>
  )
}

function Kpi({ label, value, emphasis, danger }: { label: string; value: string; emphasis?: boolean; danger?: boolean }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      <p className={`mt-1 text-xl font-bold tabular-nums ${danger ? 'text-red-700' : emphasis ? 'text-forest-800' : 'text-gray-900'}`}>{value}</p>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-gray-900">{title}</h3>
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">{children}</div>
    </div>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="p-6 text-center text-sm text-gray-500">{children}</div>
}
