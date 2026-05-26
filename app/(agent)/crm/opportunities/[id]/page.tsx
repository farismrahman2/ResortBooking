import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Topbar } from '@/components/layout/Topbar'
import { requirePermission, hasPermission } from '@/lib/auth/permissions'
import { getOpportunityById, getActivitiesByAccount } from '@/lib/queries/crm'
import { OpportunityStageActions } from '@/components/crm/OpportunityStageActions'
import { ActivitiesFeed } from '@/components/crm/ActivitiesFeed'
import { STAGE_LABELS } from '@/lib/crm/stage-probabilities'
import { EVENT_TYPE_LABELS, LOST_REASON_LABELS } from '@/components/crm/labels'
import { formatBDT } from '@/lib/formatters/currency'

export const dynamic = 'force-dynamic'

export default async function OpportunityDetailPage({ params }: { params: { id: string } }) {
  await requirePermission('crm', 'read')
  const canWrite = await hasPermission('crm', 'write')

  const opp = await getOpportunityById(params.id)
  if (!opp) notFound()
  const activities = (await getActivitiesByAccount(opp.account_id)).filter((a) => a.opportunity_id === opp.id)

  return (
    <div className="flex h-full flex-col">
      <Topbar title={opp.opportunity_name} subtitle={`${opp.opp_code} · ${opp.account?.company_name ?? ''}`}
        action={canWrite ? { label: 'Edit', href: `/crm/opportunities/${opp.id}/edit` } : undefined} />
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        <div className="mx-auto max-w-2xl space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">{STAGE_LABELS[opp.stage]}</span>
            <span className="text-sm text-gray-500">{opp.probability_pct}% · {EVENT_TYPE_LABELS[opp.event_type]}</span>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Kpi label="Est. value" value={formatBDT(opp.est_value)} />
            <Kpi label="Weighted" value={formatBDT(opp.weighted_value)} />
            <Kpi label="Pax" value={opp.pax != null ? String(opp.pax) : '—'} />
            <Kpi label="Event date" value={opp.expected_event_date ?? '—'} />
          </div>

          {opp.stage === 'won' && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
              Won{opp.actual_value != null ? ` at ${formatBDT(opp.actual_value)}` : ''}.
              {opp.linked_booking_id
                ? <> Linked booking created. <Link href={`/bookings/${opp.linked_booking_id}`} className="font-medium underline">View booking</Link></>
                : ' (Booking handoff arrives in Phase 3.)'}
            </div>
          )}
          {opp.stage === 'lost' && opp.lost_reason && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              Lost — {LOST_REASON_LABELS[opp.lost_reason]}{opp.lost_notes ? `: ${opp.lost_notes}` : ''}
            </div>
          )}
          {opp.stage === 'on_hold' && opp.hold_resume_date && (
            <div className="rounded-lg border border-stone-200 bg-stone-50 p-3 text-sm text-stone-700">On hold until {opp.hold_resume_date}</div>
          )}

          {canWrite && (
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <OpportunityStageActions oppId={opp.id} currentStage={opp.stage} estValue={opp.est_value} eventDate={opp.expected_event_date} />
            </div>
          )}

          {opp.notes && (
            <div className="rounded-xl border border-gray-200 bg-white p-4 text-sm">
              <p className="text-xs font-medium text-gray-500">Notes</p>
              <p className="mt-1 whitespace-pre-wrap text-gray-800">{opp.notes}</p>
            </div>
          )}

          <div>
            <h3 className="mb-2 text-sm font-semibold text-gray-900">Activities on this deal</h3>
            <ActivitiesFeed activities={activities} showAccount={false} />
          </div>

          <Link href={`/crm/accounts/${opp.account_id}`} className="inline-block text-sm text-amber-700 hover:underline">← Back to account</Link>
        </div>
      </div>
    </div>
  )
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-0.5 text-base font-bold tabular-nums text-gray-900">{value}</p>
    </div>
  )
}
