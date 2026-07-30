import { createClient } from '@/lib/supabase/server'
import type {
  FieldVisitWithChildren, FieldVisitListRow, FieldVisitFilters, FieldVisitBand,
} from '@/lib/supabase/types-field-visits'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createClient() as any

const PAGE = 1000

/** Editable band lookups (ORG.04 / REQ.06). */
export async function listFieldVisitBands(): Promise<{
  employeeBands: FieldVisitBand[]
  budgetBands:   FieldVisitBand[]
}> {
  const [emp, bud] = await Promise.all([
    db().from('crm_fv_employee_bands').select('*').eq('is_active', true).order('sort_order'),
    db().from('crm_fv_budget_bands').select('*').eq('is_active', true).order('sort_order'),
  ])
  if (emp.error) throw new Error(`[fieldVisits.employeeBands] ${emp.error.message}`)
  if (bud.error) throw new Error(`[fieldVisits.budgetBands] ${bud.error.message}`)
  return { employeeBands: emp.data ?? [], budgetBands: bud.data ?? [] }
}

export async function getFieldVisitById(id: string): Promise<FieldVisitWithChildren | null> {
  const { data, error } = await db()
    .from('crm_field_visits')
    .select('*, contacts:crm_field_visit_contacts(*), venues:crm_field_visit_venues(*)')
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(`[fieldVisits.getById] ${error.message}`)
  if (!data) return null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const contacts = ((data.contacts ?? []) as any[])
    .filter((c) => c.is_active)
    .sort((a, b) => a.sort_order - b.sort_order)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const venues = ((data.venues ?? []) as any[])
    .filter((v) => v.is_active)
    .sort((a, b) => a.sort_order - b.sort_order)
  return { ...data, contacts, venues } as FieldVisitWithChildren
}

/**
 * List for the index page. Decorations (rep name, sector, account) are
 * resolved with id-IN lookups rather than PostgREST embeds — self-joins and
 * nested filters have bitten this codebase before.
 */
export async function listFieldVisits(filters: FieldVisitFilters = {}): Promise<FieldVisitListRow[]> {
  let q = db().from('crm_field_visits')
    .select('*, contacts:crm_field_visit_contacts(id)')
    .order('visit_date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(PAGE)

  if (filters.status)        q = q.eq('status', filters.status)
  else                       q = q.neq('status', 'void')   // hide voided by default
  if (filters.from)          q = q.gte('visit_date', filters.from)
  if (filters.to)            q = q.lte('visit_date', filters.to)
  if (filters.executiveId)   q = q.eq('sales_executive_id', filters.executiveId)
  if (filters.interestLevel) q = q.eq('interest_level', filters.interestLevel)
  if (filters.sectorId)      q = q.eq('sector_id', filters.sectorId)
  if (filters.search)        q = q.ilike('organisation_name', `%${filters.search}%`)
  if (filters.overdueOnly) {
    const today = new Date().toISOString().slice(0, 10)
    q = q.lte('due_by', today).neq('status', 'processed')
  }

  const { data, error } = await q
  if (error) throw new Error(`[fieldVisits.list] ${error.message}`)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (data ?? []) as any[]
  if (rows.length === 0) return []

  const execIds    = [...new Set(rows.map((r) => r.sales_executive_id).filter(Boolean))] as string[]
  const sectorIds  = [...new Set(rows.map((r) => r.sector_id).filter(Boolean))] as string[]
  const accountIds = [...new Set(rows.map((r) => r.account_id).filter(Boolean))] as string[]

  const [execs, sectors, accounts] = await Promise.all([
    execIds.length    ? db().from('employees').select('id, full_name').in('id', execIds)          : Promise.resolve({ data: [] }),
    sectorIds.length  ? db().from('crm_sectors').select('id, display_name').in('id', sectorIds)   : Promise.resolve({ data: [] }),
    accountIds.length ? db().from('crm_accounts').select('id, company_name').in('id', accountIds) : Promise.resolve({ data: [] }),
  ])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const execById    = new Map((execs.data    ?? []).map((e: any) => [e.id, e.full_name]))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sectorById  = new Map((sectors.data  ?? []).map((s: any) => [s.id, s.display_name]))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const accountById = new Map((accounts.data ?? []).map((a: any) => [a.id, a.company_name]))

  return rows.map((r) => ({
    ...r,
    sales_executive_name: r.sales_executive_id ? (execById.get(r.sales_executive_id)    ?? null) : null,
    sector_name:          r.sector_id          ? (sectorById.get(r.sector_id)           ?? null) : null,
    account_name:         r.account_id         ? (accountById.get(r.account_id)         ?? null) : null,
    contact_count:        (r.contacts ?? []).length,
  })) as FieldVisitListRow[]
}

/**
 * Duplicate detection for step 2. Case-insensitive partial match on
 * crm_accounts.company_name — deliberately loose so near-misses surface.
 * NEVER auto-links; the rep decides.
 */
export async function findDuplicateAccounts(name: string): Promise<{
  id: string; company_name: string; account_code: string; parent_name: string | null
}[]> {
  const term = name.trim()
  if (term.length < 3) return []
  const { data, error } = await db()
    .from('crm_accounts')
    .select('id, company_name, account_code, parent_account_id, hq_location')
    .ilike('company_name', `%${term}%`)
    .eq('is_active', true)
    .limit(5)
  if (error) return []   // non-fatal: duplicate hinting must never block typing
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (data ?? []) as any[]
  const parentIds = [...new Set(rows.map((r) => r.parent_account_id).filter(Boolean))] as string[]
  let parentById = new Map<string, string>()
  if (parentIds.length) {
    const { data: parents } = await db().from('crm_accounts').select('id, company_name').in('id', parentIds)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    parentById = new Map((parents ?? []).map((p: any) => [p.id, p.company_name]))
  }
  return rows.map((r) => ({
    id: r.id,
    company_name: r.company_name,
    account_code: r.account_code,
    parent_name: r.parent_account_id ? (parentById.get(r.parent_account_id) ?? null) : null,
  }))
}

/** Open follow-ups for the CRM dashboard widget. */
export async function getOpenFollowUps(limit = 5): Promise<FieldVisitListRow[]> {
  const today = new Date().toISOString().slice(0, 10)
  const rows = await listFieldVisits({ overdueOnly: true })
  void today
  return rows.slice(0, limit)
}
