import Link from 'next/link'
import { FileDown } from 'lucide-react'
import { requirePermission } from '@/lib/auth/permissions'
import { resolvePeriod } from '@/lib/reports/page-params'
import { toIsoDate } from '@/lib/reports/periods'
import { getFieldVisitsReport, type CountRow } from '@/lib/queries/reports/field-visits'
import { listSalesEmployees } from '@/lib/queries/employees'
import { ReportShell } from '@/components/reports/ReportShell'
import { KpiCard } from '@/components/reports/KpiCard'
import { ExecutiveFilter } from '@/components/field-visits/ExecutiveFilter'
import { MigrationErrorBanner } from '@/components/crm/MigrationErrorBanner'
import { formatDateShort } from '@/lib/formatters/dates'
import { INTEREST_OPTIONS, FIELD_VISIT_STATUS_BADGE } from '@/lib/supabase/types-field-visits'
import type { SalesEmployee } from '@/lib/supabase/types'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: { period?: string; from?: string; to?: string; compare?: string; exec?: string }
}

/**
 * Field visits over a date range — the counts a sales manager reads first,
 * the list underneath, and the same thing as a designed PDF.
 */
export default async function FieldVisitsReportPage({ searchParams }: PageProps) {
  await requirePermission('field_visits', 'read')
  const { preset, period, mode, customFrom, customTo } = resolvePeriod(searchParams)
  const fromIso = toIsoDate(period.from)
  const toIso   = toIsoDate(period.to)
  const exec    = searchParams.exec || ''

  let data: Awaited<ReturnType<typeof getFieldVisitsReport>>
  let employees: SalesEmployee[] = []
  try {
    ;[data, employees] = await Promise.all([
      getFieldVisitsReport(fromIso, toIso, { executiveId: exec || undefined }),
      listSalesEmployees().catch(() => [] as SalesEmployee[]),
    ])
  } catch (err) {
    return (
      <div className="px-4 py-6 sm:px-6">
        <MigrationErrorBanner error={err instanceof Error ? err.message : String(err)} />
      </div>
    )
  }
  const s = data.summary
  const pdfHref = `/api/field-visits/report?from=${fromIso}&to=${toIso}${exec ? `&exec=${exec}` : ''}`

  return (
    <ReportShell
      title="Field visit report"
      subtitle="Lead discovery visits, with every recorded detail"
      period={period} preset={preset} customFrom={customFrom} customTo={customTo} mode={mode}
      toolbar={
        <div className="flex flex-wrap items-center gap-2">
          <ExecutiveFilter employees={employees} current={exec} />
          <a href={pdfHref}
            className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-forest-700 px-3 text-xs font-semibold text-white">
            <FileDown size={14} /> Download PDF
          </a>
        </div>
      }
    >
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Visits" value={String(s.visits)} mode="off"
          note={`${s.organisations} organisation${s.organisations === 1 ? '' : 's'}`} />
        <KpiCard label="Contacts met" value={String(s.contacts)} mode="off"
          note={`${s.decision_makers} decision maker${s.decision_makers === 1 ? '' : 's'}`} />
        <KpiCard label="Hot / warm / cold" value={`${s.hot} / ${s.warm} / ${s.cold}`} mode="off"
          note={`${s.brochures_given} brochure${s.brochures_given === 1 ? '' : 's'} handed out`} />
        <KpiCard label="Follow-ups open" value={String(s.follow_ups_due)} mode="off"
          note={s.overdue ? `${s.overdue} overdue` : 'none overdue'}
          emphasis={s.overdue ? 'negative' : 'default'} />
      </div>

      {s.visits > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Tally title="By executive"       rows={s.by_executive} />
          <Tally title="By sector"          rows={s.by_sector} />
          <Tally title="By territory"       rows={s.by_territory} />
          <Tally title="Events they hold"   rows={s.event_types} />
          <Tally title="Preferred day"      rows={s.preferred_days} />
          <Tally title="Agreed next steps"  rows={s.next_steps} />
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-left text-[11px] uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">Organisation</th>
              <th className="px-3 py-2">Executive</th>
              <th className="px-3 py-2">Interest</th>
              <th className="px-3 py-2">Next step</th>
              <th className="px-3 py-2">Due</th>
              <th className="px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.length === 0 ? (
              <tr><td colSpan={7} className="px-3 py-6 text-center text-gray-500">No field visits in this period.</td></tr>
            ) : data.rows.map((v) => {
              const interest = INTEREST_OPTIONS.find((o) => o.value === v.interest_level)
              return (
                <tr key={v.id} className="border-b border-gray-100 last:border-0">
                  <td className="whitespace-nowrap px-3 py-2">{v.visit_date ? formatDateShort(v.visit_date) : '—'}</td>
                  <td className="px-3 py-2">
                    <Link href={`/crm/field-visits/${v.id}`} className="font-medium text-gray-900 hover:text-forest-800">
                      {v.organisation_name?.trim() || '(no name)'}
                    </Link>
                    <span className="block text-[11px] text-gray-500">
                      {[v.visit_ref, v.sector_name, v.territory_zone].filter(Boolean).join(' · ')}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-gray-700">{v.sales_executive_name ?? '—'}</td>
                  <td className="px-3 py-2">
                    {interest && (
                      <span className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${interest.tone}`}>{interest.label}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-gray-700">{(v.next_step ?? []).join(', ') || '—'}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-gray-700">{v.due_by ? formatDateShort(v.due_by) : '—'}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${FIELD_VISIT_STATUS_BADGE[v.status]}`}>{v.status_label}</span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </ReportShell>
  )
}

function Tally({ title, rows }: { title: string; rows: CountRow[] }) {
  if (rows.length === 0) return null
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3">
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">{title}</p>
      <ul className="space-y-1 text-sm">
        {rows.slice(0, 6).map((r) => (
          <li key={r.key} className="flex justify-between gap-3">
            <span className="truncate text-gray-700">{r.key}</span>
            <span className="font-semibold tabular-nums">{r.count}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
