import { createClient } from '@/lib/supabase/server'
import { getCrmVisibility } from '@/lib/crm/visibility'
import { STAGE_LABELS } from '@/lib/crm/stage-probabilities'
import type { OpportunityStage } from '@/lib/supabase/types-crm'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createClient() as any

interface OppRow {
  id: string; account_id: string; owner_user_id: string | null; stage: OpportunityStage
  est_value: number; weighted_value: number; actual_value: number | null
  expected_event_date: string | null; won_at: string | null
}

/** Fetch opportunities scoped to the viewer's visibility. */
async function visibleOpps(): Promise<OppRow[]> {
  const vis = await getCrmVisibility()
  let q = db().from('crm_opportunities')
    .select('id, account_id, owner_user_id, stage, est_value, weighted_value, actual_value, expected_event_date, won_at')
    .eq('is_active', true)
  if (vis && !vis.elevated) q = q.eq('owner_user_id', vis.userId)
  const { data, error } = await q
  if (error) throw new Error(`[reports.crm] ${error.message}`)
  return (data ?? []) as OppRow[]
}

async function accountMeta(): Promise<Map<string, { company_name: string; sector_id: string | null; tier_id: string | null }>> {
  const { data } = await db().from('crm_accounts').select('id, company_name, sector_id, tier_id')
  const m = new Map<string, { company_name: string; sector_id: string | null; tier_id: string | null }>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const a of (data ?? []) as any[]) m.set(a.id, { company_name: a.company_name, sector_id: a.sector_id, tier_id: a.tier_id })
  return m
}

async function nameMaps() {
  const [{ data: sectors }, { data: tiers }, { data: users }] = await Promise.all([
    db().from('crm_sectors').select('id, display_name'),
    db().from('crm_tiers').select('id, display_name'),
    db().from('user_profiles').select('user_id, full_name'),
  ])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sName = new Map((sectors ?? []).map((s: any) => [s.id, s.display_name]))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tName = new Map((tiers ?? []).map((t: any) => [t.id, t.display_name]))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const uName = new Map((users ?? []).map((u: any) => [u.user_id, u.full_name]))
  return { sName, tName, uName }
}

// ── Pipeline forecast ────────────────────────────────────────────────────────

export interface ForecastRow { month: string; est_value: number; weighted_value: number; count: number }
export interface StageRow { stage: string; count: number; est_value: number; weighted_value: number }

export async function getPipelineForecast(): Promise<{ byMonth: ForecastRow[]; byStage: StageRow[] }> {
  const opps = await visibleOpps()
  const open = opps.filter((o) => o.stage !== 'won' && o.stage !== 'lost')

  const monthMap = new Map<string, ForecastRow>()
  for (const o of open) {
    const month = o.expected_event_date ? o.expected_event_date.slice(0, 7) : 'Unscheduled'
    const r = monthMap.get(month) ?? { month, est_value: 0, weighted_value: 0, count: 0 }
    r.est_value += Number(o.est_value); r.weighted_value += Number(o.weighted_value); r.count += 1
    monthMap.set(month, r)
  }
  const byMonth = [...monthMap.values()].sort((a, b) => a.month.localeCompare(b.month))
    .map((r) => ({ ...r, est_value: Math.round(r.est_value), weighted_value: Math.round(r.weighted_value) }))

  const stageMap = new Map<string, StageRow>()
  for (const o of open) {
    const r = stageMap.get(o.stage) ?? { stage: STAGE_LABELS[o.stage], count: 0, est_value: 0, weighted_value: 0 }
    r.count += 1; r.est_value += Number(o.est_value); r.weighted_value += Number(o.weighted_value)
    stageMap.set(o.stage, r)
  }
  const byStage = [...stageMap.values()].map((r) => ({ ...r, est_value: Math.round(r.est_value), weighted_value: Math.round(r.weighted_value) }))

  return { byMonth, byStage }
}

// ── Win rate ─────────────────────────────────────────────────────────────────

export interface WinRateRow { label: string; won: number; lost: number; rate: number | null }

function winRate(won: number, lost: number): number | null {
  const total = won + lost
  return total === 0 ? null : Math.round((won / total) * 1000) / 10
}

export async function getWinRate(): Promise<{ overall: WinRateRow; bySector: WinRateRow[]; byTier: WinRateRow[]; byOwner: WinRateRow[] }> {
  const [opps, accMeta, names] = await Promise.all([visibleOpps(), accountMeta(), nameMaps()])
  const closed = opps.filter((o) => o.stage === 'won' || o.stage === 'lost')

  const tally = (keyFn: (o: OppRow) => string | null, nameFn: (k: string) => string) => {
    const map = new Map<string, { won: number; lost: number }>()
    for (const o of closed) {
      const k = keyFn(o); if (!k) continue
      const r = map.get(k) ?? { won: 0, lost: 0 }
      if (o.stage === 'won') r.won += 1; else r.lost += 1
      map.set(k, r)
    }
    return [...map.entries()].map(([k, v]) => ({ label: nameFn(k), won: v.won, lost: v.lost, rate: winRate(v.won, v.lost) }))
      .sort((a, b) => (b.rate ?? -1) - (a.rate ?? -1))
  }

  const wonTotal = closed.filter((o) => o.stage === 'won').length
  const lostTotal = closed.length - wonTotal

  return {
    overall:  { label: 'Overall', won: wonTotal, lost: lostTotal, rate: winRate(wonTotal, lostTotal) },
    bySector: tally((o) => accMeta.get(o.account_id)?.sector_id ?? null, (k) => (names.sName.get(k) as string) ?? '—'),
    byTier:   tally((o) => accMeta.get(o.account_id)?.tier_id ?? null, (k) => (names.tName.get(k) as string) ?? '—'),
    byOwner:  tally((o) => o.owner_user_id, (k) => (names.uName.get(k) as string) ?? '—'),
  }
}

// ── Top accounts by closed revenue ─────────────────────────────────────────────

export interface TopAccountRow { company_name: string; won_deals: number; revenue: number }

export async function getTopAccounts(limit = 10): Promise<TopAccountRow[]> {
  const [opps, accMeta] = await Promise.all([visibleOpps(), accountMeta()])
  const map = new Map<string, { revenue: number; deals: number }>()
  for (const o of opps.filter((o) => o.stage === 'won')) {
    const r = map.get(o.account_id) ?? { revenue: 0, deals: 0 }
    r.revenue += Number(o.actual_value ?? 0); r.deals += 1
    map.set(o.account_id, r)
  }
  return [...map.entries()]
    .map(([id, v]) => ({ company_name: accMeta.get(id)?.company_name ?? '—', won_deals: v.deals, revenue: Math.round(v.revenue) }))
    .sort((a, b) => b.revenue - a.revenue).slice(0, limit)
}

// ── Activity volume ────────────────────────────────────────────────────────────

export interface ActivityVolumeRow { label: string; count: number }

export async function getActivityVolume(): Promise<{ byType: ActivityVolumeRow[]; byRep: ActivityVolumeRow[] }> {
  const vis = await getCrmVisibility()
  let q = db().from('crm_activities').select('activity_type, logged_by')
  if (vis && !vis.elevated) q = q.eq('logged_by', vis.userId)
  const [{ data }, names] = await Promise.all([q, nameMaps()])

  const typeMap = new Map<string, number>()
  const repMap = new Map<string, number>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const a of (data ?? []) as any[]) {
    typeMap.set(a.activity_type, (typeMap.get(a.activity_type) ?? 0) + 1)
    repMap.set(a.logged_by, (repMap.get(a.logged_by) ?? 0) + 1)
  }
  return {
    byType: [...typeMap.entries()].map(([k, v]) => ({ label: k, count: v })).sort((a, b) => b.count - a.count),
    byRep:  [...repMap.entries()].map(([k, v]) => ({ label: (names.uName.get(k) as string) ?? '—', count: v })).sort((a, b) => b.count - a.count),
  }
}

// ── Sector breakdown ───────────────────────────────────────────────────────────

export interface SectorRow { sector: string; accounts: number; revenue: number }

export async function getSectorBreakdown(): Promise<SectorRow[]> {
  const vis = await getCrmVisibility()
  let accQ = db().from('crm_accounts').select('id, sector_id, owner_user_id').eq('is_active', true)
  if (vis && !vis.elevated) accQ = accQ.eq('owner_user_id', vis.userId)
  const [{ data: accs }, opps, names] = await Promise.all([accQ, visibleOpps(), nameMaps()])

  const revByAccount = new Map<string, number>()
  for (const o of opps.filter((o) => o.stage === 'won')) {
    revByAccount.set(o.account_id, (revByAccount.get(o.account_id) ?? 0) + Number(o.actual_value ?? 0))
  }

  const map = new Map<string, SectorRow>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const a of (accs ?? []) as any[]) {
    const label = a.sector_id ? ((names.sName.get(a.sector_id) as string) ?? '—') : 'Unsectored'
    const r = map.get(label) ?? { sector: label, accounts: 0, revenue: 0 }
    r.accounts += 1; r.revenue += revByAccount.get(a.id) ?? 0
    map.set(label, r)
  }
  return [...map.values()].map((r) => ({ ...r, revenue: Math.round(r.revenue) })).sort((a, b) => b.revenue - a.revenue)
}
