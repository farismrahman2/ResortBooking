import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Printer, CheckCircle2, MapPin, ExternalLink, Pencil } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { requirePermission, hasPermission } from '@/lib/auth/permissions'
import { getFieldVisitById, listFieldVisitBands, findDuplicateAccounts, listVisitCards, getSignedCardUrl } from '@/lib/queries/field-visits'
import { listSectors, listTiers } from '@/lib/queries/crm'
import { listSalesEmployees } from '@/lib/queries/employees'
import { ProcessToCrmPanel } from '@/components/field-visits/ProcessToCrmPanel'
import { MigrationErrorBanner } from '@/components/crm/MigrationErrorBanner'
import { formatDate } from '@/lib/formatters/dates'
import {
  FIELD_VISIT_STATUS_LABELS, FIELD_VISIT_STATUS_BADGE, INTEREST_OPTIONS,
} from '@/lib/supabase/types-field-visits'
import type { CrmSector, CrmTier } from '@/lib/supabase/types-crm'
import type { SalesEmployee } from '@/lib/supabase/types'
import { VisitCardCapture } from '@/components/field-visits/VisitCardCapture'

export const dynamic = 'force-dynamic'

interface PageProps { params: { id: string }; searchParams: { submitted?: string } }

export default async function FieldVisitDetailPage({ params, searchParams }: PageProps) {
  await requirePermission('field_visits', 'read')
  const canWrite = await hasPermission('field_visits', 'write')

  try {
    const [visit, bands, sectors, employees, tiers] = await Promise.all([
      getFieldVisitById(params.id),
      listFieldVisitBands(),
      listSectors().catch(() => [] as CrmSector[]),
      listSalesEmployees().catch(() => [] as SalesEmployee[]),
      listTiers().catch(() => [] as CrmTier[]),
    ])
    if (!visit) notFound()

    const rawCards = await listVisitCards(params.id).catch(() => [])
    const cards = await Promise.all(rawCards.map(async (c) => ({
      id: c.id, file_name: c.file_name, contact_label: c.contact_label,
      url: await getSignedCardUrl(c.storage_path).catch(() => null),
    })))

    const suggestions = visit.status === 'submitted' && visit.organisation_name
      ? await findDuplicateAccounts(visit.organisation_name).catch(() => [])
      : []

    const sectorName = sectors.find((s) => s.id === visit.sector_id)?.display_name
    const execName   = employees.find((e) => e.id === visit.sales_executive_id)?.full_name
    const ownerName  = employees.find((e) => e.id === visit.follow_up_owner_id)?.full_name
    const empBand    = bands.employeeBands.find((b) => b.code === visit.employee_band)?.label
    const budBand    = bands.budgetBands.find((b) => b.code === visit.budget_per_head_band)?.label
    const interest   = INTEREST_OPTIONS.find((o) => o.value === visit.interest_level)

    const L = (v: string | number | null | undefined) => (v === null || v === undefined || v === '' ? '—' : String(v))
    const A = (v: string[] | null | undefined) => (v && v.length ? v.join(', ') : '—')

    return (
      <div className="flex h-full flex-col">
        <Topbar
          title={visit.organisation_name ?? visit.visit_ref}
          subtitle={`${visit.visit_ref} · Form GCR-CS-01`}
        />
        <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
          <div className="mx-auto max-w-5xl space-y-4">

            {searchParams.submitted === '1' && (
              <div className="overflow-hidden rounded-2xl border border-green-300 bg-gradient-to-b from-green-50 to-white p-5 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-600 text-white">
                  <CheckCircle2 size={30} />
                </div>
                <p className="mt-3 text-lg font-bold text-green-900">Visit logged</p>
                <p className="mt-0.5 font-mono text-sm text-green-800">{visit.visit_ref}</p>
                <p className="mt-1 text-xs text-green-700">
                  {visit.organisation_name ?? 'This organisation'} is now in the pipeline
                  {visit.interest_level ? ` as a ${visit.interest_level} lead` : ''}.
                </p>
                <div className="mt-4 grid gap-2 sm:grid-cols-3">
                  <Link
                    href={`/crm/field-visits/new?org=${encodeURIComponent(visit.organisation_name ?? '')}`}
                    className="flex min-h-[44px] items-center justify-center rounded-xl bg-green-700 px-3 text-sm font-semibold text-white"
                  >
                    Another at this org
                  </Link>
                  <Link
                    href="/crm/field-visits/new"
                    className="flex min-h-[44px] items-center justify-center rounded-xl bg-amber-600 px-3 text-sm font-semibold text-white"
                  >
                    New visit
                  </Link>
                  <Link
                    href="/crm/field-visits"
                    className="flex min-h-[44px] items-center justify-center rounded-xl border border-green-300 bg-white px-3 text-sm font-medium text-green-800"
                  >
                    All visits
                  </Link>
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${FIELD_VISIT_STATUS_BADGE[visit.status]}`}>
                {FIELD_VISIT_STATUS_LABELS[visit.status]}
              </span>
              {interest && (
                <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${interest.tone}`}>
                  {interest.label}
                </span>
              )}
              {visit.gps_lat && visit.gps_lng && (
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${visit.gps_lat},${visit.gps_lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-[32px] items-center gap-1 rounded-lg border border-gray-300 bg-white px-2 text-xs font-medium text-gray-700 hover:border-amber-400 hover:text-amber-700"
                  title="Open this location in Google Maps"
                >
                  <MapPin size={12} /> {visit.gps_lat.toFixed(4)}, {visit.gps_lng.toFixed(4)}
                  <ExternalLink size={10} className="opacity-60" />
                </a>
              )}
              <div className="ml-auto flex gap-2">
                {canWrite && (visit.status === 'draft' || visit.status === 'submitted') && (
                  <Link href={`/crm/field-visits/${visit.id}/edit/1`}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:border-amber-400">
                    <Pencil size={12} />
                    {visit.status === 'draft' ? 'Continue editing' : 'Edit visit'}
                  </Link>
                )}
                <Link href={`/crm/field-visits/${visit.id}/print`}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700">
                  <Printer size={13} /> Print
                </Link>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              <div className="space-y-4 lg:col-span-2">
                <Section title="A · Visit">
                  <Row k="Visit date"  v={visit.visit_date ? formatDate(visit.visit_date) : '—'} />
                  <Row k="Executive"   v={L(execName)} />
                  <Row k="Territory"   v={L(visit.territory_zone)} />
                  <Row k="Visit type"  v={L(visit.visit_type?.replace(/_/g, ' '))} />
                </Section>

                <Section title="B · Organisation">
                  <Row k="Name"      v={L(visit.organisation_name)} />
                  <Row k="Address"   v={L(visit.office_address)} />
                  <Row k="Sector"    v={L(sectorName)} />
                  <Row k="Employees" v={L(empBand)} />
                </Section>

                <Section title="C · Contacts">
                  {visit.contacts.length === 0
                    ? <p className="text-sm text-gray-400">None recorded</p>
                    : visit.contacts.map((c) => (
                        <Row key={c.id}
                          k={`${c.name ?? '—'}${c.is_decision_maker ? ' ★' : ''}`}
                          v={[c.designation, c.department, c.mobile, c.email].filter(Boolean).join(' · ') || '—'} />
                      ))}
                  <Row k="Sign-off"  v={A(visit.decision_signoff)} />
                  <Row k="Best time" v={L(visit.best_time_to_call)} />
                  <Row k="Channel"   v={A(visit.preferred_channel)} />
                </Section>

                {cards.length > 0 && (
                  <Section title="Visiting cards">
                    <VisitCardCapture
                      visitId={visit.id}
                      cards={cards}
                      editable={canWrite && visit.status !== 'processed' && visit.status !== 'void'}
                      compact
                    />
                  </Section>
                )}

                <Section title="D · Requirements">
                  <Row k="Event types"  v={A(visit.event_types)} />
                  <Row k="Per year"     v={L(visit.events_per_year)} />
                  <Row k="Headcount"    v={L(visit.typical_headcount)} />
                  <Row k="Format"       v={A(visit.event_format)} />
                  <Row k="Preferred day" v={A(visit.preferred_day)} />
                  <Row k="Budget/head"  v={L(budBand)} />
                  <Row k="Rooms needed" v={L(visit.rooms_needed)} />
                  <Row k="Annual spend" v={L(visit.annual_event_spend)} />
                  <Row k="Peak months"  v={A(visit.peak_months)} />
                  <Row k="Transport"    v={A(visit.transport)} />
                </Section>

                <Section title="E · Current venues">
                  {visit.venues.length === 0
                    ? <p className="text-sm text-gray-400">None recorded</p>
                    : visit.venues.map((v) => (
                        <Row key={v.id} k={L(v.venue_name)}
                          v={[v.event_month_year, v.pax ? `${v.pax} pax` : null, v.rate_per_head ? `৳${v.rate_per_head}/head` : null, v.feedback]
                            .filter(Boolean).join(' · ') || '—'} />
                      ))}
                </Section>

                <Section title="F · Outcome">
                  <Row k="Interest"   v={L(visit.interest_level)} />
                  <Row k="Materials"  v={A(visit.materials_given)} />
                  <Row k="Next event" v={[visit.next_event_month, visit.next_event_type, visit.next_event_pax ? `${visit.next_event_pax} pax` : null].filter(Boolean).join(' · ') || '—'} />
                  <Row k="Next step"  v={A(visit.next_step)} />
                  <Row k="Due by"     v={visit.due_by ? formatDate(visit.due_by) : '—'} />
                  <Row k="Owner"      v={L(ownerName)} />
                </Section>
              </div>

              <div className="space-y-4">
                <ProcessToCrmPanel
                  visitId={visit.id}
                  status={visit.status}
                  organisationName={visit.organisation_name}
                  suggestions={suggestions}
                  tiers={tiers}
                  canWrite={canWrite}
                  accountId={visit.account_id}
                />
              </div>
            </div>

            <Link href="/crm/field-visits" className="inline-block text-sm text-amber-700 hover:underline">
              ← Back to field visits
            </Link>
          </div>
        </div>
      </div>
    )
  } catch (err) {
    if (err && typeof err === 'object' && 'digest' in err) throw err
    return (
      <div className="px-4 py-6">
        <MigrationErrorBanner error={err instanceof Error ? err.message : String(err)} />
      </div>
    )
  }
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <div className="border-b border-gray-200 bg-gray-50 px-4 py-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-600">{title}</p>
      </div>
      <div className="space-y-1 px-4 py-3">{children}</div>
    </div>
  )
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-gray-50 py-1.5 last:border-0">
      <span className="flex-shrink-0 text-xs text-gray-500">{k}</span>
      <span className="max-w-[65%] text-right text-sm text-gray-900">{v}</span>
    </div>
  )
}
