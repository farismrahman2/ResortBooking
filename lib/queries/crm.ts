import { createClient } from '@/lib/supabase/server'
import { getCrmVisibility, ownerFilterId } from '@/lib/crm/visibility'
import type {
  CrmSector, CrmTier, CrmAccount, CrmContact, CrmAccountWithRelations, AccountStatus,
} from '@/lib/supabase/types-crm'

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
