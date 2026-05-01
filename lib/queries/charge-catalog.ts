import { createClient } from '@/lib/supabase/server'
import { cachedRef } from '@/lib/cache'
import type {
  ChargeCategoryRow,
  ChargeItemRow,
  ChargeItemWithCategory,
} from '@/lib/supabase/types'

function coerceItem(r: any): ChargeItemRow {
  return { ...r, default_price: Number(r.default_price ?? 0) }
}

const _listActiveChargeCategories = cachedRef<ChargeCategoryRow[]>(
  'charge-categories-active',
  async (db) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (db as any)
      .from('charge_categories')
      .select('*')
      .eq('is_active', true)
      .order('display_order', { ascending: true })
    if (error) throw new Error(`listChargeCategories: ${error.message}`)
    return (data ?? []) as ChargeCategoryRow[]
  },
  { tags: ['charge-catalog'], revalidate: 300 },
)

const _listAllChargeCategories = cachedRef<ChargeCategoryRow[]>(
  'charge-categories-all',
  async (db) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (db as any)
      .from('charge_categories')
      .select('*')
      .order('display_order', { ascending: true })
    if (error) throw new Error(`listChargeCategories: ${error.message}`)
    return (data ?? []) as ChargeCategoryRow[]
  },
  { tags: ['charge-catalog'], revalidate: 300 },
)

export async function listChargeCategories(opts: {
  includeInactive?: boolean
} = {}): Promise<ChargeCategoryRow[]> {
  return opts.includeInactive ? _listAllChargeCategories() : _listActiveChargeCategories()
}

const _listActiveChargeItems = cachedRef<ChargeItemWithCategory[]>(
  'charge-items-active',
  async (db) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (db as any)
      .from('charge_items')
      .select(`
        *,
        category:charge_categories!inner (id, slug, display_name)
      `)
      .eq('is_active', true)
      .order('display_order', { ascending: true })
      .order('name', { ascending: true })
    if (error) throw new Error(`listChargeItems: ${error.message}`)
    return (data ?? []).map((r: any) => ({ ...coerceItem(r), category: r.category })) as ChargeItemWithCategory[]
  },
  { tags: ['charge-catalog'], revalidate: 300 },
)

const _listAllChargeItems = cachedRef<ChargeItemWithCategory[]>(
  'charge-items-all',
  async (db) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (db as any)
      .from('charge_items')
      .select(`
        *,
        category:charge_categories!inner (id, slug, display_name)
      `)
      .order('display_order', { ascending: true })
      .order('name', { ascending: true })
    if (error) throw new Error(`listChargeItems: ${error.message}`)
    return (data ?? []).map((r: any) => ({ ...coerceItem(r), category: r.category })) as ChargeItemWithCategory[]
  },
  { tags: ['charge-catalog'], revalidate: 300 },
)

export async function listChargeItems(opts: {
  includeInactive?: boolean
} = {}): Promise<ChargeItemWithCategory[]> {
  return opts.includeInactive ? _listAllChargeItems() : _listActiveChargeItems()
}

export async function getChargeItemById(id: string): Promise<ChargeItemRow | null> {
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any
  const { data } = await db.from('charge_items').select('*').eq('id', id).maybeSingle()
  return data ? coerceItem(data) : null
}
