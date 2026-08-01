import { notFound, redirect } from 'next/navigation'
import { requirePermission } from '@/lib/auth/permissions'
import { getFieldVisitById, listFieldVisitBands, listVisitCards, getSignedCardUrl } from '@/lib/queries/field-visits'
import { listSectors } from '@/lib/queries/crm'
import { listSalesEmployees } from '@/lib/queries/employees'
import { FieldVisitWizard } from '@/components/field-visits/FieldVisitWizard'
import { MigrationErrorBanner } from '@/components/crm/MigrationErrorBanner'
import { TOTAL_STEPS } from '@/lib/validators/field-visits'
import type { CrmSector } from '@/lib/supabase/types-crm'
import type { SalesEmployee } from '@/lib/supabase/types'
import type { FieldVisitBand, FieldVisitWithChildren } from '@/lib/supabase/types-field-visits'

export const dynamic = 'force-dynamic'

interface PageProps { params: { id: string; step: string }; searchParams?: { org?: string } }

export default async function FieldVisitStepPage({ params, searchParams }: PageProps) {
  await requirePermission('field_visits', 'write')

  const step = Number(params.step)
  if (!Number.isInteger(step) || step < 1 || step > TOTAL_STEPS) {
    redirect(`/crm/field-visits/${params.id}/edit/1`)
  }

  try {
    const [visit, bands, sectors, employees, rawCards] = await Promise.all([
      getFieldVisitById(params.id),
      listFieldVisitBands(),
      listSectors().catch(() => [] as CrmSector[]),
      listSalesEmployees().catch(() => [] as SalesEmployee[]),
      listVisitCards(params.id).catch(() => []),
    ])
    // Private bucket — pre-sign each card so the client can render it.
    const cards = await Promise.all(rawCards.map(async (c) => ({
      id: c.id, file_name: c.file_name, contact_label: c.contact_label,
      url: await getSignedCardUrl(c.storage_path).catch(() => null),
    })))
    // A missing row is NOT an error here: /new mints the id and redirects
    // without writing anything, so the row only appears once the rep types
    // something. Render a blank shell against that id.
    const shell: FieldVisitWithChildren = visit ?? {
      id: params.id, visit_ref: 'Not saved yet', status: 'draft',
      visit_date: null, sales_executive_id: null, territory_zone: null, visit_type: null,
      organisation_name: searchParams?.org?.trim() || null,
      office_address: null, sector_id: null, employee_band: null,
      decision_signoff: [], best_time_to_call: null, preferred_channel: [],
      event_types: [], events_per_year: null, typical_headcount: null,
      event_format: [], preferred_day: [], budget_per_head_band: null,
      rooms_needed: null, annual_event_spend: null, peak_months: [], transport: [],
      interest_level: null, materials_given: [], next_event_month: null,
      next_event_type: null, next_event_pax: null, next_step: [],
      due_by: null, follow_up_owner_id: null,
      account_id: null, pipeline_stage: null, discount_tier: null, crm_activity_id: null,
      processed_by: null, processed_at: null,
      gps_lat: null, gps_lng: null, submitted_at: null, void_reason: null,
      created_by: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      contacts: [], venues: [],
    }
    // Processed and void records are frozen; drafts and submitted stay editable.
    if (visit && visit.status !== 'draft' && visit.status !== 'submitted') {
      redirect(`/crm/field-visits/${params.id}`)
    }

    return (
      <FieldVisitWizard
        visit={shell}
        initialStep={step}
        sectors={sectors}
        employees={employees}
        employeeBands={bands.employeeBands as FieldVisitBand[]}
        budgetBands={bands.budgetBands as FieldVisitBand[]}
        cards={cards}
      />
    )
  } catch (err) {
    // Next's redirect()/notFound() throw control-flow errors — never swallow them.
    if (err && typeof err === 'object' && 'digest' in err) throw err
    return (
      <div className="px-4 py-6">
        <MigrationErrorBanner error={err instanceof Error ? err.message : String(err)} />
      </div>
    )
  }
}
