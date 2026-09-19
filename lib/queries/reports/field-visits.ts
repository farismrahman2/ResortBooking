import { createClient } from '@/lib/supabase/server'
import { listFieldVisitBands } from '@/lib/queries/field-visits'
import {
  VISIT_TYPE_OPTIONS, MATERIALS_OPTIONS, FIELD_VISIT_STATUS_LABELS,
  type FieldVisitWithChildren, type FieldVisitContact, type FieldVisitVenue,
} from '@/lib/supabase/types-field-visits'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createClient() as any

/** A visit with every code resolved to the word a reader expects. */
export interface FieldVisitReportRow extends FieldVisitWithChildren {
  sales_executive_name: string | null
  follow_up_owner_name: string | null
  sector_name:          string | null
  account_name:         string | null
  employee_band_label:  string | null
  budget_band_label:    string | null
  visit_type_label:     string | null
  status_label:         string
  materials_labels:     string[]
  /** Contacts and venues here are the active ones, in form order. */
  contacts: FieldVisitContact[]
  venues:   FieldVisitVenue[]
}

export interface CountRow { key: string; count: number }

export interface FieldVisitsReport {
  from:   string
  to:     string
  rows:   FieldVisitReportRow[]
  summary: {
    visits:          number
    organisations:   number
    contacts:        number
    decision_makers: number
    hot:             number
    warm:            number
    cold:            number
    brochures_given: number
    follow_ups_due:  number   // due_by within range end and not processed
    overdue:         number   // due_by before today and not processed
    by_executive:    CountRow[]
    by_sector:       CountRow[]
    by_territory:    CountRow[]
    by_visit_type:   CountRow[]
    by_status:       CountRow[]
    event_types:     CountRow[]
    preferred_days:  CountRow[]
    budget_bands:    CountRow[]
    next_steps:      CountRow[]
  }
}

export interface FieldVisitsReportFilters {
  executiveId?: string
  /** Voided visits are hidden unless asked for. */
  includeVoid?: boolean
}

function tally(keys: Array<string | null | undefined>): CountRow[] {
  const m = new Map<string, number>()
  for (const k of keys) {
    if (!k) continue
    m.set(k, (m.get(k) ?? 0) + 1)
  }
  return [...m.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count)
}

/**
 * Every field visit in a date range, fully resolved, plus the counts a sales
 * manager reads first. The PDF and the page both render from this one shape,
 * so what prints is what the screen showed.
 */
export async function getFieldVisitsReport(
  fromIso: string,
  toIso:   string,
  filters: FieldVisitsReportFilters = {},
): Promise<FieldVisitsReport> {
  let q = db().from('crm_field_visits')
    .select('*, contacts:crm_field_visit_contacts(*), venues:crm_field_visit_venues(*)')
    .gte('visit_date', fromIso)
    .lte('visit_date', toIso)
    .order('visit_date', { ascending: true })
    .order('created_at', { ascending: true })
    .limit(2000)
  if (!filters.includeVoid) q = q.neq('status', 'void')
  if (filters.executiveId)  q = q.eq('sales_executive_id', filters.executiveId)

  const [{ data, error }, bands] = await Promise.all([q, listFieldVisitBands()])
  if (error) throw new Error(`[fieldVisitsReport] ${error.message}`)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = (data ?? []) as any[]

  // Names come from id-IN lookups, as the list page does — PostgREST embeds on
  // employees have bitten this codebase before.
  const ids = (key: string) => [...new Set(raw.map((r) => r[key]).filter(Boolean))] as string[]
  const execIds    = [...new Set([...ids('sales_executive_id'), ...ids('follow_up_owner_id')])]
  const sectorIds  = ids('sector_id')
  const accountIds = ids('account_id')

  const [execs, sectors, accounts] = await Promise.all([
    execIds.length    ? db().from('employees').select('id, full_name').in('id', execIds)          : Promise.resolve({ data: [] }),
    sectorIds.length  ? db().from('crm_sectors').select('id, display_name').in('id', sectorIds)   : Promise.resolve({ data: [] }),
    accountIds.length ? db().from('crm_accounts').select('id, company_name').in('id', accountIds) : Promise.resolve({ data: [] }),
  ])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nameOf = (rows: any[], field: string) => new Map<string, string>(rows.map((r) => [r.id, r[field]]))
  const execById    = nameOf(execs.data ?? [], 'full_name')
  const sectorById  = nameOf(sectors.data ?? [], 'display_name')
  const accountById = nameOf(accounts.data ?? [], 'company_name')
  const empBand     = new Map(bands.employeeBands.map((b) => [b.code, b.label]))
  const budBand     = new Map(bands.budgetBands.map((b) => [b.code, b.label]))
  const visitType   = new Map(VISIT_TYPE_OPTIONS.map((o) => [o.value, o.label]))
  const material    = new Map(MATERIALS_OPTIONS.map((o) => [o.value, o.label]))

  const rows: FieldVisitReportRow[] = raw.map((r) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const contacts = ((r.contacts ?? []) as any[])
      .filter((c) => c.is_active !== false && (c.name?.trim() || c.mobile?.trim() || c.email?.trim()))
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const venues = ((r.venues ?? []) as any[])
      .filter((v) => v.is_active !== false && (v.venue_name?.trim() || v.feedback?.trim()))
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    return {
      ...r,
      contacts,
      venues,
      sales_executive_name: r.sales_executive_id ? (execById.get(r.sales_executive_id) ?? null) : null,
      follow_up_owner_name: r.follow_up_owner_id ? (execById.get(r.follow_up_owner_id) ?? null) : null,
      sector_name:          r.sector_id  ? (sectorById.get(r.sector_id)   ?? null) : null,
      account_name:         r.account_id ? (accountById.get(r.account_id) ?? null) : null,
      employee_band_label:  r.employee_band        ? (empBand.get(r.employee_band)        ?? r.employee_band) : null,
      budget_band_label:    r.budget_per_head_band ? (budBand.get(r.budget_per_head_band) ?? r.budget_per_head_band) : null,
      visit_type_label:     r.visit_type ? (visitType.get(r.visit_type) ?? r.visit_type) : null,
      status_label:         FIELD_VISIT_STATUS_LABELS[r.status as keyof typeof FIELD_VISIT_STATUS_LABELS] ?? r.status,
      materials_labels:     ((r.materials_given ?? []) as string[]).map((m) => material.get(m) ?? m),
    } as FieldVisitReportRow
  })

  const today = new Date().toISOString().slice(0, 10)
  const open  = rows.filter((r) => r.status !== 'processed' && r.due_by)

  return {
    from: fromIso,
    to:   toIso,
    rows,
    summary: {
      visits:          rows.length,
      organisations:   new Set(rows.map((r) => (r.organisation_name ?? '').trim().toLowerCase()).filter(Boolean)).size,
      contacts:        rows.reduce((s, r) => s + r.contacts.length, 0),
      decision_makers: rows.reduce((s, r) => s + r.contacts.filter((c) => c.is_decision_maker).length, 0),
      hot:             rows.filter((r) => r.interest_level === 'hot').length,
      warm:            rows.filter((r) => r.interest_level === 'warm').length,
      cold:            rows.filter((r) => r.interest_level === 'cold').length,
      brochures_given: rows.filter((r) => (r.materials_given ?? []).includes('brochure')).length,
      follow_ups_due:  open.length,
      overdue:         open.filter((r) => r.due_by! < today).length,
      by_executive:    tally(rows.map((r) => r.sales_executive_name)),
      by_sector:       tally(rows.map((r) => r.sector_name)),
      by_territory:    tally(rows.map((r) => r.territory_zone?.trim())),
      by_visit_type:   tally(rows.map((r) => r.visit_type_label)),
      by_status:       tally(rows.map((r) => r.status_label)),
      event_types:     tally(rows.flatMap((r) => r.event_types ?? [])),
      preferred_days:  tally(rows.flatMap((r) => r.preferred_day ?? [])),
      budget_bands:    tally(rows.map((r) => r.budget_band_label)),
      next_steps:      tally(rows.flatMap((r) => r.next_step ?? [])),
    },
  }
}
