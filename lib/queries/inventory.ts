import { createClient } from '@/lib/supabase/server'
import type {
  InvStore,
  InvCategory,
  InvUnit,
  InvSupplier,
  InvItem,
  InvItemWithRefs,
  InvItemWithStock,
} from '@/lib/supabase/types-inventory'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createClient() as any

// ─── Stores / categories / units ─────────────────────────────────────────────

export async function listStores(activeOnly = true): Promise<InvStore[]> {
  let q = db().from('inv_stores').select('*').order('display_order', { ascending: true })
  if (activeOnly) q = q.eq('is_active', true)
  const { data, error } = await q
  if (error) throw new Error(`[inventory.listStores] ${error.message}`)
  return (data ?? []) as InvStore[]
}

export async function getStoreBySlug(slug: string): Promise<InvStore | null> {
  const { data, error } = await db().from('inv_stores').select('*').eq('slug', slug).maybeSingle()
  if (error) throw new Error(`[inventory.getStoreBySlug] ${error.message}`)
  return (data ?? null) as InvStore | null
}

export async function listCategories(storeId?: string): Promise<InvCategory[]> {
  let q = db().from('inv_categories').select('*').eq('is_active', true)
    .order('display_order', { ascending: true })
  if (storeId) q = q.eq('store_id', storeId)
  const { data, error } = await q
  if (error) throw new Error(`[inventory.listCategories] ${error.message}`)
  return (data ?? []) as InvCategory[]
}

export async function listUnits(): Promise<InvUnit[]> {
  const { data, error } = await db().from('inv_units').select('*')
    .order('display_order', { ascending: true })
  if (error) throw new Error(`[inventory.listUnits] ${error.message}`)
  return (data ?? []) as InvUnit[]
}

// ─── Suppliers ────────────────────────────────────────────────────────────────

export interface SupplierFilters {
  search?: string
  active?: boolean
}

export async function listSuppliers(filters: SupplierFilters = {}): Promise<InvSupplier[]> {
  let q = db().from('inv_suppliers').select('*').order('name', { ascending: true })
  if (filters.active !== undefined) q = q.eq('is_active', filters.active)
  if (filters.search) q = q.ilike('name', `%${filters.search}%`)
  const { data, error } = await q
  if (error) throw new Error(`[inventory.listSuppliers] ${error.message}`)
  return (data ?? []) as InvSupplier[]
}

export async function getSupplierById(id: string): Promise<InvSupplier | null> {
  const { data, error } = await db().from('inv_suppliers').select('*').eq('id', id).maybeSingle()
  if (error) throw new Error(`[inventory.getSupplierById] ${error.message}`)
  return (data ?? null) as InvSupplier | null
}

// ─── Items ──────────────────────────────────────────────────────────────────

export interface ItemFilters {
  storeId?:     string
  categoryId?:  string
  supplierId?:  string
  search?:      string
  lowStockOnly?: boolean
  activeOnly?:  boolean
}

const ITEM_SELECT = `
  *,
  unit:inv_units (slug, display_name, abbreviation, unit_type),
  category:inv_categories (slug, display_name),
  store:inv_stores (slug, display_name),
  supplier:inv_suppliers!inv_items_default_supplier_id_fkey (id, name)
`

function withStockFlags(item: InvItemWithRefs): InvItemWithStock {
  const isBelowReorder = item.reorder_point != null && item.current_stock <= item.reorder_point
  const isBelowPar     = item.par_level != null && item.current_stock < item.par_level
  return { ...item, isBelowReorder, isBelowPar }
}

export async function listItems(filters: ItemFilters = {}): Promise<InvItemWithStock[]> {
  let q = db().from('inv_items').select(ITEM_SELECT).order('name', { ascending: true })
  if (filters.activeOnly !== false) q = q.eq('is_active', true)
  if (filters.storeId)    q = q.eq('store_id', filters.storeId)
  if (filters.categoryId) q = q.eq('category_id', filters.categoryId)
  if (filters.supplierId) q = q.eq('default_supplier_id', filters.supplierId)
  if (filters.search)     q = q.or(`name.ilike.%${filters.search}%,sku_code.ilike.%${filters.search}%`)

  const { data, error } = await q
  if (error) throw new Error(`[inventory.listItems] ${error.message}`)

  let rows = (data ?? []).map((r: InvItemWithRefs) => withStockFlags(r))
  if (filters.lowStockOnly) rows = rows.filter((r: InvItemWithStock) => r.isBelowReorder)
  return rows
}

export async function getItemById(id: string): Promise<InvItemWithStock | null> {
  const { data, error } = await db().from('inv_items').select(ITEM_SELECT).eq('id', id).maybeSingle()
  if (error) throw new Error(`[inventory.getItemById] ${error.message}`)
  if (!data) return null
  return withStockFlags(data as InvItemWithRefs)
}

/** Per-store+category count, for SKU sequence generation. */
export async function countItemsInCategory(storeId: string, categoryId: string): Promise<number> {
  const { count, error } = await db().from('inv_items')
    .select('id', { count: 'exact', head: true })
    .eq('store_id', storeId)
    .eq('category_id', categoryId)
  if (error) throw new Error(`[inventory.countItemsInCategory] ${error.message}`)
  return count ?? 0
}

// ─── Hub KPIs ─────────────────────────────────────────────────────────────────

export interface InventoryHubKpis {
  total_skus:       number
  below_reorder:    number
  below_par:        number
  stock_value:      number
}

export async function getInventoryHubKpis(): Promise<InventoryHubKpis> {
  const { data, error } = await db().from('inv_items')
    .select('current_stock, reorder_point, par_level, avg_purchase_price')
    .eq('is_active', true)
  if (error) throw new Error(`[inventory.getInventoryHubKpis] ${error.message}`)

  let below_reorder = 0, below_par = 0, stock_value = 0
  for (const r of (data ?? []) as Array<Pick<InvItem, 'current_stock' | 'reorder_point' | 'par_level' | 'avg_purchase_price'>>) {
    if (r.reorder_point != null && r.current_stock <= r.reorder_point) below_reorder += 1
    if (r.par_level != null && r.current_stock < r.par_level) below_par += 1
    stock_value += Number(r.current_stock) * Number(r.avg_purchase_price ?? 0)
  }
  return {
    total_skus:    (data ?? []).length,
    below_reorder,
    below_par,
    stock_value:   Math.round(stock_value * 100) / 100,
  }
}
