import { NextResponse } from 'next/server'
import { getCurrentUserContext } from '@/lib/auth/permissions'
import { listFieldVisits } from '@/lib/queries/field-visits'
import { toCsv } from '@/lib/data-export/csv'
import type { FieldVisitFilters, InterestLevel, FieldVisitStatus } from '@/lib/supabase/types-field-visits'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * CSV headers carry the paper field codes (VIS.01, ORG.03 …) so an exported
 * sheet can be reconciled against Form GCR-CS-01 Rev 4.0 line by line.
 */
const HEADERS = [
  'visit_ref', 'status',
  'visit_date', 'sales_executive (VIS)', 'territory_zone', 'visit_type (VIS.01)',
  'organisation_name (ORG.01)', 'office_address (ORG.02)', 'sector (ORG.03)', 'employee_band (ORG.04)',
  'event_types (REQ.01)', 'events_per_year (REQ.02)', 'typical_headcount (REQ.03)',
  'contacts_count', 'decision_signoff (CON.04)',
  'event_format (REQ.04)', 'preferred_day (REQ.05)', 'budget_per_head_band (REQ.06)',
  'rooms_needed (REQ.07)', 'annual_event_spend (REQ.08)', 'peak_months (REQ.09)',
  'interest_level (OUT.01)', 'materials_given (OUT.02)', 'next_event_month (OUT.03)',
  'next_event_type (OUT.04)', 'next_event_pax (OUT.05)', 'next_step (OUT.06)', 'due_by (OUT.07)',
  'linked_account', 'pipeline_stage', 'discount_tier', 'submitted_at', 'processed_at',
]

export async function GET(req: Request) {
  const ctx = await getCurrentUserContext()
  if (!ctx) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const lvl = ctx.permissions.field_visits
  if (lvl !== 'read' && lvl !== 'write') {
    return NextResponse.json({ error: 'You do not have access to field visits' }, { status: 403 })
  }

  const url = new URL(req.url)
  const filters: FieldVisitFilters = {
    from:          url.searchParams.get('from') ?? undefined,
    to:            url.searchParams.get('to') ?? undefined,
    executiveId:   url.searchParams.get('exec') ?? undefined,
    interestLevel: (url.searchParams.get('interest') as InterestLevel) ?? undefined,
    status:        (url.searchParams.get('status') as FieldVisitStatus) ?? undefined,
    sectorId:      url.searchParams.get('sector') ?? undefined,
    overdueOnly:   url.searchParams.get('overdue') === '1',
    search:        url.searchParams.get('q') ?? undefined,
  }

  try {
    const rows = await listFieldVisits(filters)
    const stamp = new Date().toISOString().slice(0, 10)
    if (rows.length === 0) {
      return new NextResponse(HEADERS.join(',') + '\r\n', {
        status: 200,
        headers: {
          'Content-Type':        'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="field-visits_${stamp}.csv"`,
          'Cache-Control':       'no-store',
        },
      })
    }

    const csv = toCsv(rows.map((r) => ({
      'visit_ref':                    r.visit_ref,
      'status':                       r.status,
      'visit_date':                   r.visit_date ?? '',
      'sales_executive (VIS)':        r.sales_executive_name ?? '',
      'territory_zone':               r.territory_zone ?? '',
      'visit_type (VIS.01)':          r.visit_type ?? '',
      'organisation_name (ORG.01)':   r.organisation_name ?? '',
      'office_address (ORG.02)':      r.office_address ?? '',
      'sector (ORG.03)':              r.sector_name ?? '',
      'employee_band (ORG.04)':       r.employee_band ?? '',
      'contacts_count':               r.contact_count,
      'decision_signoff (CON.04)':    (r.decision_signoff ?? []).join(' | '),
      'event_types (REQ.01)':         (r.event_types ?? []).join(' | '),
      'events_per_year (REQ.02)':     r.events_per_year ?? '',
      'typical_headcount (REQ.03)':   r.typical_headcount ?? '',
      'event_format (REQ.04)':        (r.event_format ?? []).join(' | '),
      'preferred_day (REQ.05)':       (r.preferred_day ?? []).join(' | '),
      'budget_per_head_band (REQ.06)': r.budget_per_head_band ?? '',
      'rooms_needed (REQ.07)':        r.rooms_needed ?? '',
      'annual_event_spend (REQ.08)':  r.annual_event_spend ?? '',
      'peak_months (REQ.09)':         (r.peak_months ?? []).join(' | '),
      'interest_level (OUT.01)':      r.interest_level ?? '',
      'materials_given (OUT.02)':     (r.materials_given ?? []).join(' | '),
      'next_event_month (OUT.03)':    r.next_event_month ?? '',
      'next_event_type (OUT.04)':     r.next_event_type ?? '',
      'next_event_pax (OUT.05)':      r.next_event_pax ?? '',
      'next_step (OUT.06)':           (r.next_step ?? []).join(' | '),
      'due_by (OUT.07)':              r.due_by ?? '',
      'linked_account':               r.account_name ?? '',
      'pipeline_stage':               r.pipeline_stage ?? '',
      'discount_tier':                r.discount_tier ?? '',
      'submitted_at':                 r.submitted_at ?? '',
      'processed_at':                 r.processed_at ?? '',
    })))

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type':        'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="field-visits_${stamp}.csv"`,
        'Cache-Control':       'no-store',
      },
    })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
