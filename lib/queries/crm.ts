import { createClient } from '@/lib/supabase/server'
import { getCrmVisibility, ownerFilterId } from '@/lib/crm/visibility'
import type {
  CrmSector, CrmTier, CrmAccount, CrmContact, CrmAccountWithRelations, AccountStatus,
  CrmOpportunity, CrmOpportunityWithRelations, CrmActivityWithRelations,
  OpportunityStage, PipelineColumn,
} from '@/lib/supabase/types-crm'
import { STAGE_ORDER } from '@/lib/crm/stage-probabilities'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createClient() as any

// ─── Lookups ──────────────────────────────────────────────────────────────────

export async function listSectors(): Promise<CrmSector[]> {
  const { data, error } = await db().from('crm_sectors').select('*').eq('is_active', true)
    .order('display_order', { ascending: true })
  if (error) throw new Error(`[crm.listSectors] ${error.message}`)
  return (data ?? []) as CrmSector[]
}

export async function listTiers(): Promise<CrmTier[]> {
  const { data, error } = await db().from('crm_tiers').select('*').order('display_order', { ascending: true })
  if (error) throw new Error(`[crm.listTiers] ${error.message}`)
  return (data ?? []) as CrmTier[]
}

// ─── Accounts ──────────────────────────────────────────────────────────────────

export interface AccountFilters {
  status?:    AccountStatus
  sectorId?:  string
  tierId?:    string
  search?:    string
  ownerView?: 'mine' | 'all'
}

const ACCOUNT_SELECT = `
  *,
  sector:crm_sectors (slug, display_name),
  tier:crm_tiers (slug, display_name, default_discount_pct),
  parent:crm_accounts!crm_accounts_parent_account_id_fkey (id, company_name)
`

async function decorateAccounts(rows: CrmAccount[]): Promise<CrmAccountWithRelations[]> {
  if (rows.length === 0) return []
  const ids = rows.map((r) => r.id)
  const ownerIds = [...new Set(rows.map((r) => r.owner_user_id).filter(Boolean))] as string[]

  const [{ data: contacts }, { data: owners }, { data: childCounts }] = await Promise.all([
    db().from('crm_contacts').select('id, account_id, full_name, designation, phone, is_primary, is_active')
      .in('account_id', ids).eq('is_primary', true).eq('is_active', true),
    ownerIds.length
      ? db().from('user_profiles').select('user_id, full_name').in('user_id', ownerIds)
      : Promise.resolve({ data: [] }),
    db().from('crm_accounts').select('parent_account_id').in('parent_account_id', ids).eq('is_active', true),
  ])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const primaryByAccount = new Map<string, any>()
  for (const c of contacts ?? []) primaryByAccount.set(c.account_id, c)
  const ownerName = new Map<string, string>()
  for (const o of owners ?? []) ownerName.set(o.user_id, o.full_name)
  const childCount = new Map<string, number>()
  for (const c of childCounts ?? []) childCount.set(c.parent_account_id, (childCount.get(c.parent_account_id) ?? 0) + 1)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return rows.map((r: any) => ({
    ...r,
    owner_name:      r.owner_user_id ? (ownerName.get(r.owner_user_id) ?? null) : null,
    primary_contact: primaryByAccount.get(r.id)
      ? {
          id:          primaryByAccount.get(r.id).id,
          full_name:   primaryByAccount.get(r.id).full_name,
          designation: primaryByAccount.get(r.id).designation,
          phone:       primaryByAccount.get(r.id).phone,
        }
      : null,
    children_count: childCount.get(r.id) ?? 0,
  })) as CrmAccountWithRelations[]
}

export async function listAccounts(filters: AccountFilters = {}): Promise<CrmAccountWithRelations[]> {
  const vis = await getCrmVisibility()
  let q = db().from('crm_accounts').select(ACCOUNT_SELECT).eq('is_active', true)
    .order('company_name', { ascending: true })

  if (vis) {
    const ownerId = ownerFilterId(vis, filters.ownerView ?? 'mine')
    if (ownerId) q = q.eq('owner_user_id', ownerId)
  }
  if (filters.status)   q = q.eq('status', filters.status)
  if (filters.sectorId) q = q.eq('sector_id', filters.sectorId)
  if (filters.tierId)   q = q.eq('tier_id', filters.tierId)
  if (filters.search)   q = q.or(`company_name.ilike.%${filters.search}%,account_code.ilike.%${filters.search}%`)

  const { data, error } = await q
  if (error) throw new Error(`[crm.listAccounts] ${error.message}`)
  return decorateAccounts((data ?? []) as CrmAccount[])
}

/** Counts for the My/All owner toggle. */
export async function getAccountCounts(): Promise<{ mine: number; all: number }> {
  const vis = await getCrmVisibility()
  const base = () => db().from('crm_accounts').select('id', { count: 'exact', head: true }).eq('is_active', true)
  const [{ count: all }, mineRes] = await Promise.all([
    base(),
    vis && !vis.elevated ? base().eq('owner_user_id', vis.userId) : Promise.resolve({ count: null }),
  ])
  return { all: all ?? 0, mine: mineRes.count ?? all ?? 0 }
}

export async function getAccountById(id: string): Promise<CrmAccountWithRelations | null> {
  const { data, error } = await db().from('crm_accounts').select(ACCOUNT_SELECT).eq('id', id).maybeSingle()
  if (error) throw new Error(`[crm.getAccountById] ${error.message}`)
  if (!data) return null
  const [decorated] = await decorateAccounts([data as CrmAccount])
  return decorated ?? null
}

export async function listChildAccounts(parentId: string): Promise<CrmAccount[]> {
  const { data, error } = await db().from('crm_accounts').select('*')
    .eq('parent_account_id', parentId).eq('is_active', true).order('company_name', { ascending: true })
  if (error) throw new Error(`[crm.listChildAccounts] ${error.message}`)
  return (data ?? []) as CrmAccount[]
}

// ─── Contacts ──────────────────────────────────────────────────────────────────

export async function listContactsByAccount(accountId: string): Promise<CrmContact[]> {
  const { data, error } = await db().from('crm_contacts').select('*')
    .eq('account_id', accountId).eq('is_active', true)
    .order('is_primary', { ascending: false }).order('full_name', { ascending: true })
  if (error) throw new Error(`[crm.listContactsByAccount] ${error.message}`)
  return (data ?? []) as CrmContact[]
}

export async function getContactById(id: string): Promise<CrmContact | null> {
  const { data, error } = await db().from('crm_contacts').select('*').eq('id', id).maybeSingle()
  if (error) throw new Error(`[crm.getContactById] ${error.message}`)
  return (data ?? null) as CrmContact | null
}

// ─── Hub KPIs ─────────────────────────────────────────────────────────────────

export interface CrmHubKpis {
  total_accounts: number
  by_status:      Record<string, number>
  recent:         CrmAccountWithRelations[]
}

export async function getCrmHubKpis(): Promise<CrmHubKpis> {
  const vis = await getCrmVisibility()
  let q = db().from('crm_accounts').select('status, owner_user_id, last_engaged_at').eq('is_active', true)
  if (vis && !vis.elevated) q = q.eq('owner_user_id', vis.userId)
  const { data, error } = await q
  if (error) throw new Error(`[crm.getCrmHubKpis] ${error.message}`)

  const by_status: Record<string, number> = {}
  for (const r of (data ?? []) as Array<{ status: string }>) by_status[r.status] = (by_status[r.status] ?? 0) + 1

  // Recent = top 5 by last_engaged_at (falls back to created order via listAccounts)
  const recentRows = await listAccounts({ ownerView: 'mine' })
  const recent = [...recentRows]
    .sort((a, b) => (b.last_engaged_at ?? b.created_at).localeCompare(a.last_engaged_at ?? a.created_at))
    .slice(0, 5)

  return { total_accounts: (data ?? []).length, by_status, recent }
}

// ─── Opportunities (Phase 2) ───────────────────────────────────────────────────

const OPP_SELECT = `
  *,
  account:crm_accounts (id, company_name, account_code),
  primary_contact:crm_contacts (id, full_name, phone)
`

async function decorateOpps(rows: CrmOpportunity[]): Promise<CrmOpportunityWithRelations[]> {
  if (rows.length === 0) return []
  const ownerIds = [...new Set(rows.map((r) => r.owner_user_id).filter(Boolean))] as string[]
  const { data: owners } = ownerIds.length
    ? await db().from('user_profiles').select('user_id, full_name').in('user_id', ownerIds)
    : { data: [] }
  const ownerName = new Map<string, string>()
  for (const o of owners ?? []) ownerName.set(o.user_id, o.full_name)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return rows.map((r: any) => ({ ...r, owner_name: r.owner_user_id ? (ownerName.get(r.owner_user_id) ?? null) : null }))
}

export interface OpportunityFilters {
  stage?:     OpportunityStage
  accountId?: string
  ownerView?: 'mine' | 'all'
  eventFrom?: string
  eventTo?:   string
  sectorId?:  string
}

export async function listOpportunities(filters: OpportunityFilters = {}): Promise<CrmOpportunityWithRelations[]> {
  const vis = await getCrmVisibility()
  let q = db().from('crm_opportunities').select(OPP_SELECT).eq('is_active', true)
    .order('updated_at', { ascending: false })
  if (vis) {
    const ownerId = ownerFilterId(vis, filters.ownerView ?? 'mine')
    if (ownerId) q = q.eq('owner_user_id', ownerId)
  }
  if (filters.stage)     q = q.eq('stage', filters.stage)
  if (filters.accountId) q = q.eq('account_id', filters.accountId)
  if (filters.eventFrom) q = q.gte('expected_event_date', filters.eventFrom)
  if (filters.eventTo)   q = q.lte('expected_event_date', filters.eventTo)

  const { data, error } = await q
  if (error) throw new Error(`[crm.listOpportunities] ${error.message}`)
  let rows = await decorateOpps((data ?? []) as CrmOpportunity[])
  // Sector filter requires the account's sector — resolve client-side if asked.
  if (filters.sectorId) {
    const accIds = [...new Set(rows.map((r) => r.account_id))]
    const { data: accs } = await db().from('crm_accounts').select('id, sector_id').in('id', accIds)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sectorByAcc = new Map((accs ?? []).map((a: any) => [a.id, a.sector_id]))
    rows = rows.filter((r) => sectorByAcc.get(r.account_id) === filters.sectorId)
  }
  return rows
}

export async function getOpportunityById(id: string): Promise<CrmOpportunityWithRelations | null> {
  const { data, error } = await db().from('crm_opportunities').select(OPP_SELECT).eq('id', id).maybeSingle()
  if (error) throw new Error(`[crm.getOpportunityById] ${error.message}`)
  if (!data) return null
  const [d] = await decorateOpps([data as CrmOpportunity])
  return d ?? null
}

export async function getPipelineByStage(ownerView: 'mine' | 'all' = 'mine', sectorId?: string): Promise<PipelineColumn[]> {
  const opps = await listOpportunities({ ownerView, sectorId })
  return STAGE_ORDER.map((stage) => {
    const inStage = opps.filter((o) => o.stage === stage)
    return {
      stage,
      opportunities:  inStage,
      count:          inStage.length,
      total_value:    inStage.reduce((s, o) => s + Number(o.est_value), 0),
      weighted_value: inStage.reduce((s, o) => s + Number(o.weighted_value), 0),
    }
  })
}

// ─── Activities (Phase 2) ──────────────────────────────────────────────────────

async function decorateActivities(rows: CrmActivityWithRelations[]): Promise<CrmActivityWithRelations[]> {
  if (rows.length === 0) return []
  const accIds = [...new Set(rows.map((r) => r.account_id))]
  const userIds = [...new Set(rows.map((r) => r.logged_by))]
  const contactIds = [...new Set(rows.map((r) => r.contact_id).filter(Boolean))] as string[]
  const [{ data: accs }, { data: users }, { data: contacts }] = await Promise.all([
    db().from('crm_accounts').select('id, company_name').in('id', accIds),
    db().from('user_profiles').select('user_id, full_name').in('user_id', userIds),
    contactIds.length ? db().from('crm_contacts').select('id, full_name').in('id', contactIds) : Promise.resolve({ data: [] }),
  ])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const accName = new Map((accs ?? []).map((a: any) => [a.id, a.company_name]))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userName = new Map((users ?? []).map((u: any) => [u.user_id, u.full_name]))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const contactName = new Map((contacts ?? []).map((c: any) => [c.id, c.full_name]))
  return rows.map((r) => ({
    ...r,
    account_name:   (accName.get(r.account_id) as string) ?? null,
    logged_by_name: (userName.get(r.logged_by) as string) ?? null,
    contact_name:   r.contact_id ? ((contactName.get(r.contact_id) as string) ?? null) : null,
  }))
}

export async function listActivities(limit = 200): Promise<CrmActivityWithRelations[]> {
  const vis = await getCrmVisibility()
  let q = db().from('crm_activities').select('*')
    .order('activity_date', { ascending: false }).order('created_at', { ascending: false }).limit(limit)
  if (vis && !vis.elevated) q = q.eq('logged_by', vis.userId)
  const { data, error } = await q
  if (error) throw new Error(`[crm.listActivities] ${error.message}`)
  return decorateActivities((data ?? []) as CrmActivityWithRelations[])
}

export async function getActivitiesByAccount(accountId: string): Promise<CrmActivityWithRelations[]> {
  const { data, error } = await db().from('crm_activities').select('*').eq('account_id', accountId)
    .order('activity_date', { ascending: false })
  if (error) throw new Error(`[crm.getActivitiesByAccount] ${error.message}`)
  return decorateActivities((data ?? []) as CrmActivityWithRelations[])
}

export async function getNextStepsDue(daysAhead = 7): Promise<CrmActivityWithRelations[]> {
  const today = new Date().toISOString().slice(0, 10)
  const end = new Date(); end.setDate(end.getDate() + daysAhead)
  const endIso = end.toISOString().slice(0, 10)
  const vis = await getCrmVisibility()
  let q = db().from('crm_activities').select('*')
    .not('next_step_date', 'is', null).gte('next_step_date', today).lte('next_step_date', endIso)
    .order('next_step_date', { ascending: true })
  if (vis && !vis.elevated) q = q.eq('logged_by', vis.userId)
  const { data, error } = await q
  if (error) throw new Error(`[crm.getNextStepsDue] ${error.message}`)
  return decorateActivities((data ?? []) as CrmActivityWithRelations[])
}
