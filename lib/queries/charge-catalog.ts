import { createClient } from '@/lib/supabase/server'
import type {
  ChargeCategoryRow,
  ChargeItemRow,
  ChargeItemWithCategory,
} from '@/lib/supabase/types'

function coerceItem(r: any): ChargeItemRow {
  return { ...r, default_price: Number(r.default_price ?? 0) }
}

export async function listChargeCategories(opts: {
  includeInactive?: boolean
} = {}): Promise<ChargeCategoryRow[]> {
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any
  let query = db.from('charge_categories').select('*').order('display_order', { ascending: true })
  if (!opts.includeInactive) query = query.eq('is_active', true)
  const { data, error } = await query
  if (error) throw new Error(`listChargeCategories: ${error.message}`)
  return (data ?? []) as ChargeCategoryRow[]
}

export async function listChargeItems(opts: {
  includeInactive?: boolean
} = {}): Promise<ChargeItemWithCategory[]> {
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any
  let query = db
    .from('charge_items')
    .select(`
      *,
      category:charge_categories!inner (id, slug, display_name)
    `)
    .order('display_order', { ascending: true })
    .order('name', { ascending: true })
  if (!opts.includeInactive) query = query.eq('is_active', true)
  const { data, error } = await query
  if (error) throw new Error(`listChargeItems: ${error.message}`)
  return (data ?? []).map((r: any) => ({ ...coerceItem(r), category: r.category })) as ChargeItemWithCategory[]
}

export async function getChargeItemById(id: string): Promise<ChargeItemRow | null> {
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any
  const { data } = await db.from('charge_items').select('*').eq('id', id).maybeSingle()
  return data ? coerceItem(data) : null
}
