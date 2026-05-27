import { createClient } from '@/lib/supabase/server'
import { computeDepreciation } from '@/lib/fixed-assets/depreciation'
import type {
  FaCategory, FaLocation, FaAsset, FaMaintenanceLog, FaAssetWithRelations,
  AssetStatus, AssetCondition, FaAudit, FaAuditFull, FaAuditLine,
} from '@/lib/supabase/types-fixed-assets'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createClient() as any

function depFor(a: FaAsset) {
  return computeDepreciation({
    acquisitionCost:       Number(a.acquisition_cost),
    salvageValue:          Number(a.salvage_value),
    usefulLifeYears:       a.useful_life_years,
    depreciationStartDate: new Date(a.depreciation_start_date + 'T00:00:00'),
    disposalDate:          a.disposal_date ? new Date(a.disposal_date + 'T00:00:00') : null,
  })
}

// ─── Lookups ────────────────────────────────────────────────────────────────

export async function listCategories(): Promise<FaCategory[]> {
  const { data, error } = await db().from('fa_categories').select('*').order('display_order', { ascending: true })
  if (error) throw new Error(`[fa.listCategories] ${error.message}`)
  return (data ?? []) as FaCategory[]
}

export async function listLocations(): Promise<FaLocation[]> {
  const { data, error } = await db().from('fa_locations').select('*').order('display_order', { ascending: true })
  if (error) throw new Error(`[fa.listLocations] ${error.message}`)
  return (data ?? []) as FaLocation[]
}

// ─── Assets ───────────────────────────────────────────────────────────────────

export interface AssetFilters {
  categoryId?: string
  locationId?: string
  status?:     AssetStatus
  condition?:  AssetCondition
  custodianId?: string
  search?:     string
  activeOnly?: boolean
}

const ASSET_SELECT = `
  *,
  category:fa_categories (slug, display_name),
  location:fa_locations (slug, display_name)
`

async function decorate(rows: FaAsset[]): Promise<FaAssetWithRelations[]> {
  if (rows.length === 0) return []
  const custodianIds = [...new Set(rows.map((r) => r.custodian_employee_id).filter(Boolean))] as string[]
  const vendorIds = [...new Set(rows.map((r) => r.vendor_id).filter(Boolean))] as string[]
  const [{ data: emps }, { data: vendors }] = await Promise.all([
    custodianIds.length ? db().from('employees').select('id, full_name').in('id', custodianIds) : Promise.resolve({ data: [] }),
    vendorIds.length ? db().from('expense_payees').select('id, name').in('id', vendorIds) : Promise.resolve({ data: [] }),
  ])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const empName = new Map((emps ?? []).map((e: any) => [e.id, e.full_name]))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const vendName = new Map((vendors ?? []).map((v: any) => [v.id, v.name]))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return rows.map((r: any) => ({
    ...r,
    category:       r.category ?? null,
    location:       r.location ?? null,
    custodian_name: r.custodian_employee_id ? (empName.get(r.custodian_employee_id) ?? null) : null,
    vendor_name:    r.vendor_id ? (vendName.get(r.vendor_id) ?? null) : null,
    depreciation:   depFor(r),
  })) as FaAssetWithRelations[]
}

export async function listAssets(filters: AssetFilters = {}): Promise<FaAssetWithRelations[]> {
  let q = db().from('fa_assets').select(ASSET_SELECT).order('asset_tag', { ascending: true })
  if (filters.activeOnly !== false) q = q.eq('is_active', true)
  if (filters.categoryId)  q = q.eq('category_id', filters.categoryId)
  if (filters.locationId)  q = q.eq('location_id', filters.locationId)
  if (filters.status)      q = q.eq('status', filters.status)
  if (filters.condition)   q = q.eq('condition', filters.condition)
  if (filters.custodianId) q = q.eq('custodian_employee_id', filters.custodianId)
  if (filters.search)      q = q.or(`name.ilike.%${filters.search}%,asset_tag.ilike.%${filters.search}%,serial_number.ilike.%${filters.search}%`)
  const { data, error } = await q
  if (error) throw new Error(`[fa.listAssets] ${error.message}`)
  return decorate((data ?? []) as FaAsset[])
}

export async function getAssetById(id: string): Promise<FaAssetWithRelations | null> {
  const { data, error } = await db().from('fa_assets').select(ASSET_SELECT).eq('id', id).maybeSingle()
  if (error) throw new Error(`[fa.getAssetById] ${error.message}`)
  if (!data) return null
  const [d] = await decorate([data as FaAsset])
  return d ?? null
}

export async function listMaintenanceForAsset(assetId: string): Promise<FaMaintenanceLog[]> {
  const { data, error } = await db().from('fa_maintenance_log').select('*')
    .eq('asset_id', assetId).order('maintenance_date', { ascending: false })
  if (error) throw new Error(`[fa.listMaintenanceForAsset] ${error.message}`)
  return (data ?? []) as FaMaintenanceLog[]
}

// ─── Maintenance + locations ──────────────────────────────────────────────────

export interface MaintenanceWithAsset extends FaMaintenanceLog {
  asset_name: string | null
  asset_tag:  string | null
}

async function decorateMaintenance(rows: FaMaintenanceLog[]): Promise<MaintenanceWithAsset[]> {
  if (rows.length === 0) return []
  const assetIds = [...new Set(rows.map((r) => r.asset_id))]
  const { data: assets } = await db().from('fa_assets').select('id, name, asset_tag').in('id', assetIds)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const byId = new Map((assets ?? []).map((a: any) => [a.id, a]))
  return rows.map((r) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const a = byId.get(r.asset_id) as any
    return { ...r, asset_name: a?.name ?? null, asset_tag: a?.asset_tag ?? null }
  })
}

export async function listRecentMaintenance(limit = 100): Promise<MaintenanceWithAsset[]> {
  const { data, error } = await db().from('fa_maintenance_log').select('*')
    .order('maintenance_date', { ascending: false }).limit(limit)
  if (error) throw new Error(`[fa.listRecentMaintenance] ${error.message}`)
  return decorateMaintenance((data ?? []) as FaMaintenanceLog[])
}

export async function getMaintenanceDue(daysAhead = 30): Promise<MaintenanceWithAsset[]> {
  const today = new Date().toISOString().slice(0, 10)
  const end = new Date(); end.setDate(end.getDate() + daysAhead)
  const endIso = end.toISOString().slice(0, 10)
  const { data, error } = await db().from('fa_maintenance_log').select('*')
    .not('next_service_date', 'is', null).gte('next_service_date', today).lte('next_service_date', endIso)
    .order('next_service_date', { ascending: true })
  if (error) throw new Error(`[fa.getMaintenanceDue] ${error.message}`)
  return decorateMaintenance((data ?? []) as FaMaintenanceLog[])
}

export async function getLocationsWithCounts(): Promise<Array<FaLocation & { asset_count: number }>> {
  const [locs, { data: assets }] = await Promise.all([
    listLocations(),
    db().from('fa_assets').select('location_id').eq('is_active', true).eq('status', 'active'),
  ])
  const counts = new Map<string, number>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const a of (assets ?? []) as any[]) if (a.location_id) counts.set(a.location_id, (counts.get(a.location_id) ?? 0) + 1)
  return locs.map((l) => ({ ...l, asset_count: counts.get(l.id) ?? 0 }))
}

// ─── Hub KPIs ───────────────────────────────────────────────────────────────

export interface FixedAssetsHubKpis {
  total_assets:        number
  total_acquisition:   number
  total_nbv:           number
  by_condition:        Record<string, number>
  maintenance_due:     number
}

export async function getFixedAssetsHubKpis(): Promise<FixedAssetsHubKpis> {
  const [{ data: assets, error }, { data: dueRows }] = await Promise.all([
    db().from('fa_assets').select('*').eq('is_active', true).eq('status', 'active'),
    db().from('fa_maintenance_log').select('next_service_date').not('next_service_date', 'is', null),
  ])
  if (error) throw new Error(`[fa.getFixedAssetsHubKpis] ${error.message}`)

  let total_acquisition = 0, total_nbv = 0
  const by_condition: Record<string, number> = {}
  for (const a of (assets ?? []) as FaAsset[]) {
    total_acquisition += Number(a.acquisition_cost)
    total_nbv += depFor(a).netBookValue
    by_condition[a.condition] = (by_condition[a.condition] ?? 0) + 1
  }

  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() + 30)
  const cutoffIso = cutoff.toISOString().slice(0, 10)
  const today = new Date().toISOString().slice(0, 10)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const maintenance_due = ((dueRows ?? []) as any[]).filter((r) => r.next_service_date >= today && r.next_service_date <= cutoffIso).length

  return {
    total_assets:      (assets ?? []).length,
    total_acquisition: Math.round(total_acquisition * 100) / 100,
    total_nbv:         Math.round(total_nbv * 100) / 100,
    by_condition,
    maintenance_due,
  }
}

// ─── Depreciation reporting (Phase 2) ─────────────────────────────────────────

export interface SchedulePoint { label: string; nbv: number; accumulated: number }

/** Year-by-year NBV from acquisition to end of useful life (for the chart). */
export function getDepreciationSchedule(asset: FaAsset): SchedulePoint[] {
  const start = new Date(asset.depreciation_start_date + 'T00:00:00')
  const points: SchedulePoint[] = []
  for (let year = 0; year <= asset.useful_life_years; year++) {
    const asOf = new Date(start); asOf.setFullYear(asOf.getFullYear() + year)
    const dep = computeDepreciation({
      acquisitionCost: Number(asset.acquisition_cost), salvageValue: Number(asset.salvage_value),
      usefulLifeYears: asset.useful_life_years, depreciationStartDate: start, asOfDate: asOf,
    })
    points.push({ label: `Yr ${year}`, nbv: dep.netBookValue, accumulated: dep.totalDepreciation })
  }
  return points
}

/** Total straight-line depreciation expense for the month containing `monthIso`. */
export async function getMonthlyDepreciationTotal(monthIso: string): Promise<number> {
  const monthEnd = monthIso.slice(0, 7) + '-28'   // safe end-of-month proxy
  const { data, error } = await db().from('fa_assets').select('*').eq('is_active', true)
  if (error) throw new Error(`[fa.getMonthlyDepreciationTotal] ${error.message}`)
  let total = 0
  for (const a of (data ?? []) as FaAsset[]) {
    if (a.depreciation_start_date > monthEnd) continue
    if (a.disposal_date && a.disposal_date <= monthEnd) continue
    const dep = depFor(a)
    if (dep.isFullyDepreciated || dep.monthsElapsed <= 0) continue
    total += dep.monthlyDepreciation
  }
  return Math.round(total * 100) / 100
}

export interface CategoryNbvRow { category: string; count: number; acquisition: number; nbv: number }

export async function getRegisterByCategory(): Promise<CategoryNbvRow[]> {
  const assets = await listAssets({ status: 'active', activeOnly: false })
  const map = new Map<string, CategoryNbvRow>()
  for (const a of assets) {
    const key = a.category?.display_name ?? '—'
    const r = map.get(key) ?? { category: key, count: 0, acquisition: 0, nbv: 0 }
    r.count += 1; r.acquisition += Number(a.acquisition_cost); r.nbv += a.depreciation.netBookValue
    map.set(key, r)
  }
  return [...map.values()].map((r) => ({ ...r, acquisition: Math.round(r.acquisition), nbv: Math.round(r.nbv) }))
    .sort((a, b) => b.nbv - a.nbv)
}

// ─── Audits (Phase 3) ──────────────────────────────────────────────────────────

export async function listAudits(): Promise<FaAudit[]> {
  const { data, error } = await db().from('fa_audits').select('*').order('started_at', { ascending: false })
  if (error) throw new Error(`[fa.listAudits] ${error.message}`)
  return (data ?? []) as FaAudit[]
}

export async function getAuditById(id: string): Promise<FaAuditFull | null> {
  const [{ data: audit }, { data: lines }] = await Promise.all([
    db().from('fa_audits').select('*').eq('id', id).maybeSingle(),
    db().from('fa_audit_lines').select('*').eq('audit_id', id),
  ])
  if (!audit) return null

  const lineRows = (lines ?? []) as FaAuditLine[]
  const assetIds = [...new Set(lineRows.map((l) => l.asset_id))]
  const locIds = [...new Set([
    ...lineRows.map((l) => l.expected_location_id).filter(Boolean),
  ])] as string[]
  const [{ data: assets }, { data: locs }] = await Promise.all([
    assetIds.length ? db().from('fa_assets').select('id, name, asset_tag, condition').in('id', assetIds) : Promise.resolve({ data: [] }),
    locIds.length ? db().from('fa_locations').select('id, display_name').in('id', locIds) : Promise.resolve({ data: [] }),
  ])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const aById = new Map((assets ?? []).map((a: any) => [a.id, a]))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lById = new Map((locs ?? []).map((l: any) => [l.id, l.display_name]))

  const decorated = lineRows.map((l) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const a = aById.get(l.asset_id) as any
    return {
      ...l,
      asset_name:        a?.name ?? null,
      asset_tag:         a?.asset_tag ?? null,
      current_condition: a?.condition ?? null,
      expected_location: l.expected_location_id ? ((lById.get(l.expected_location_id) as string) ?? null) : null,
    }
  }).sort((x, y) => (x.asset_tag ?? '').localeCompare(y.asset_tag ?? ''))

  return { ...audit, lines: decorated } as FaAuditFull
}

// ─── Reports (Phase 4) ─────────────────────────────────────────────────────────

export interface MaintenanceCostRow { label: string; count: number; total: number }

export async function getMaintenanceCostByCategory(): Promise<MaintenanceCostRow[]> {
  const { data: logs, error } = await db().from('fa_maintenance_log').select('asset_id, cost')
  if (error) throw new Error(`[fa.getMaintenanceCostByCategory] ${error.message}`)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (logs ?? []) as any[]
  const assetIds = [...new Set(rows.map((r) => r.asset_id))]
  if (assetIds.length === 0) return []
  const { data: assets } = await db().from('fa_assets').select('id, category:fa_categories (display_name)').in('id', assetIds)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const catByAsset = new Map((assets ?? []).map((a: any) => [a.id, a.category?.display_name ?? '—']))
  const map = new Map<string, MaintenanceCostRow>()
  for (const r of rows) {
    const label = (catByAsset.get(r.asset_id) as string) ?? '—'
    const m = map.get(label) ?? { label, count: 0, total: 0 }
    m.count += 1; m.total += Number(r.cost ?? 0)
    map.set(label, m)
  }
  return [...map.values()].map((m) => ({ ...m, total: Math.round(m.total) })).sort((a, b) => b.total - a.total)
}

export interface DisposalSummaryRow { year: number; count: number; proceeds: number; nbv: number; gain_loss: number }

export async function getDisposalSummary(): Promise<DisposalSummaryRow[]> {
  const { data, error } = await db().from('fa_assets').select('*').neq('status', 'active').not('disposal_date', 'is', null)
  if (error) throw new Error(`[fa.getDisposalSummary] ${error.message}`)
  const map = new Map<number, DisposalSummaryRow>()
  for (const a of (data ?? []) as FaAsset[]) {
    const year = Number((a.disposal_date as string).slice(0, 4))
    const nbv = computeDepreciation({
      acquisitionCost: Number(a.acquisition_cost), salvageValue: Number(a.salvage_value),
      usefulLifeYears: a.useful_life_years, depreciationStartDate: new Date(a.depreciation_start_date + 'T00:00:00'),
      asOfDate: new Date((a.disposal_date as string) + 'T00:00:00'),
    }).netBookValue
    const proceeds = Number(a.disposal_proceeds ?? 0)
    const r = map.get(year) ?? { year, count: 0, proceeds: 0, nbv: 0, gain_loss: 0 }
    r.count += 1; r.proceeds += proceeds; r.nbv += nbv; r.gain_loss += proceeds - nbv
    map.set(year, r)
  }
  return [...map.values()].map((r) => ({
    year: r.year, count: r.count, proceeds: Math.round(r.proceeds), nbv: Math.round(r.nbv), gain_loss: Math.round(r.gain_loss),
  })).sort((a, b) => b.year - a.year)
}

export interface ReplacementRow { id: string; asset_tag: string; name: string; category: string; nbv: number; remaining_months: number }

export async function getComingUpForReplacement(monthsThreshold = 12): Promise<ReplacementRow[]> {
  const assets = await listAssets({ status: 'active', activeOnly: false })
  return assets
    .filter((a) => a.depreciation.remainingUsefulMonths <= monthsThreshold)
    .map((a) => ({
      id: a.id, asset_tag: a.asset_tag, name: a.name, category: a.category?.display_name ?? '—',
      nbv: a.depreciation.netBookValue, remaining_months: a.depreciation.remainingUsefulMonths,
    }))
    .sort((x, y) => x.remaining_months - y.remaining_months)
}
