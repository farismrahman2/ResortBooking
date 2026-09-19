import { describe, expect, it, vi } from 'vitest'

/**
 * The report query resolves every code to a word, and the PDF shows a field
 * only when it was filled in. Both are pinned here with one sparse visit and
 * one complete one.
 */

const EXEC = 'e1'
const base = {
  status: 'submitted', sales_executive_id: EXEC, follow_up_owner_id: EXEC, visit_type: null,
  office_address: null, employee_band: null, decision_signoff: [], best_time_to_call: null,
  preferred_channel: [], event_types: [], events_per_year: null, typical_headcount: null,
  event_format: [], preferred_day: [], budget_per_head_band: null, rooms_needed: null,
  annual_event_spend: null, peak_months: [], transport: [], materials_given: [],
  next_event_month: null, next_event_type: null, next_event_pax: null, next_step: [],
  due_by: null, account_id: null, pipeline_stage: null, discount_tier: null, processed_at: null,
  gps_lat: null, gps_lng: null, submitted_at: null, void_reason: null, venues: [],
}

const TABLES: Record<string, unknown[]> = {
  crm_field_visits: [
    // Sparse: a name, a date, a warm lead — nothing else.
    { ...base, id: 'v1', visit_ref: 'GCR-FV-00001', visit_date: '2026-09-02', organisation_name: 'Sparse Ltd',
      territory_zone: 'Banani', sector_id: 's1', interest_level: 'warm', created_at: '2026-09-02T09:00:00Z',
      contacts: [] },
    // Complete, and its follow-up is already late.
    { ...base, id: 'v2', visit_ref: 'GCR-FV-00002', visit_date: '2026-09-05', organisation_name: 'Complete Bank',
      territory_zone: 'Gulshan', sector_id: 's1', interest_level: 'hot', visit_type: 'appointment',
      office_address: 'Plot 4, Gulshan 2', employee_band: '100_500', decision_signoff: ['HR'],
      event_types: ['Annual picnic', 'Team building'], event_format: ['Daylong'], preferred_day: ['Weekday'],
      budget_per_head_band: 'gt_2500', annual_event_spend: 450000, peak_months: ['January'],
      materials_given: ['visiting_card', 'brochure'], next_event_month: 'November', next_event_pax: 80,
      next_step: ['Send proposal'], due_by: '2020-01-01', gps_lat: 23.79, gps_lng: 90.41,
      submitted_at: '2026-09-05T11:00:00Z', created_at: '2026-09-05T09:00:00Z',
      contacts: [
        { id: 'c1', name: 'Rahim', designation: 'AGM', department: 'HR', mobile: '01700000000', email: null,
          is_decision_maker: true, is_active: true, sort_order: 0 },
        { id: 'c2', name: null, designation: null, department: null, mobile: null, email: null,
          is_decision_maker: false, is_active: true, sort_order: 1 },   // an empty row — must vanish
      ],
      venues: [{ id: 'x1', venue_name: 'Sea Pearl', event_month_year: 'Jan 2026', pax: 120, rate_per_head: 3200,
                 feedback: 'Too far', is_active: true, sort_order: 0 }] },
  ],
  employees:             [{ id: EXEC, full_name: 'Shible Sadik' }],
  crm_sectors:           [{ id: 's1', display_name: 'Banking' }],
  crm_accounts:          [],
  crm_fv_employee_bands: [{ code: '100_500', label: '100 - 500', is_active: true, sort_order: 2 }],
  crm_fv_budget_bands:   [{ code: 'gt_2500', label: '2,500+', is_active: true, sort_order: 5 }],
}

function stub() {
  return {
    from(table: string) {
      const rows = TABLES[table] ?? []
      const chain: Record<string, unknown> = {}
      for (const m of ['select', 'gte', 'lte', 'eq', 'neq', 'in', 'order', 'limit']) chain[m] = () => chain
      chain.then = (res: (v: { data: unknown[]; error: null }) => unknown) => res({ data: rows, error: null })
      return chain
    },
  }
}
vi.mock('@/lib/supabase/server', () => ({ createClient: () => stub(), createServiceClient: () => stub() }))

const { getFieldVisitsReport } = await import('./field-visits')
const { FieldVisitsReportDocument } = await import('@/lib/pdf/field-visits-report')
const report = await getFieldVisitsReport('2026-09-01', '2026-09-30')

/** Every string the document draws. */
function drawn(node: unknown): string[] {
  if (node == null || typeof node === 'boolean') return []
  if (typeof node === 'string' || typeof node === 'number') return [String(node)]
  if (Array.isArray(node)) return node.flatMap(drawn)
  const el = node as { type?: unknown; props?: Record<string, unknown> }
  if (!el.props) return []
  // Group / VisitCard are plain function components: expand them, or the
  // labels they hold in props never reach the walk.
  if (typeof el.type === 'function') return drawn((el.type as (p: unknown) => unknown)(el.props))
  const out: string[] = []
  if (typeof el.props.render === 'function') {
    out.push(String((el.props.render as (o: unknown) => unknown)({ pageNumber: 1, totalPages: 1 })))
  }
  return out.concat(drawn(el.props.children))
}
const text = drawn(FieldVisitsReportDocument({
  report, resortName: 'Garden Centre Resort', resortAddress: 'Kaliganj', resortPhone: '',
  generatedAt: new Date('2026-09-19T00:00:00Z'),
})).join('\n')

describe('the field visit report query', () => {
  it('turns codes into words', () => {
    const v = report.rows.find((r) => r.visit_ref === 'GCR-FV-00002')!
    expect(v.sales_executive_name).toBe('Shible Sadik')
    expect(v.sector_name).toBe('Banking')
    expect(v.employee_band_label).toBe('100 - 500')
    expect(v.budget_band_label).toBe('2,500+')
    expect(v.visit_type_label).toBe('Appointment')
    expect(v.materials_labels).toEqual(['Visiting card', 'Brochure'])
  })

  it('drops an empty contact row and counts decision makers', () => {
    const v = report.rows.find((r) => r.visit_ref === 'GCR-FV-00002')!
    expect(v.contacts).toHaveLength(1)
    expect(report.summary.contacts).toBe(1)
    expect(report.summary.decision_makers).toBe(1)
  })

  it('summarises what a manager asks first', () => {
    const s = report.summary
    expect(s.visits).toBe(2)
    expect(s.hot).toBe(1)
    expect(s.warm).toBe(1)
    expect(s.brochures_given).toBe(1)
    expect(s.follow_ups_due).toBe(1)
    expect(s.overdue).toBe(1)
    expect(s.by_sector).toEqual([{ key: 'Banking', count: 2 }])
    expect(s.event_types[0]).toEqual({ key: 'Annual picnic', count: 1 })
  })
})

describe('the field visit report PDF', () => {
  it('prints a field only when it was filled in', () => {
    // The complete visit carries these labels …
    for (const label of ['Budget / head', 'Annual spend', 'Sign-off by', 'Venues they use now', 'Due by']) {
      expect(text).toContain(label)
    }
    // … and each appears exactly once, because the sparse visit has none of them.
    expect(text.split('Budget / head').length - 1).toBe(1)
    expect(text.split('Sign-off by').length - 1).toBe(1)
    expect(text).not.toContain('Rooms needed')       // empty on both visits
    expect(text).toContain('Sparse Ltd')
  })

  it('writes money and dates in glyphs Helvetica has', () => {
    expect(text).toContain('BDT 4,50,000')
    expect(text).not.toMatch(/[৳\u{1F300}-\u{1FAFF}←-⇿]/u)
  })

  it('keeps the page-number footer', () => {
    expect(text).toContain('Page 1 of 1')
  })
})
