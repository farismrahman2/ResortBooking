import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createClient() as any

export interface DateRange { from: string; to: string }   // YYYY-MM-DD inclusive

// Shape of a movement line joined with its movement + item, used across reports.
interface JoinedLine {
  quantity:             number
  unit_price:           number
  adjustment_direction: string | null
  movement: {
    movement_type: string
    movement_date: string
    status:        string
    store_id:      string
    adjustment_reason: string | null
  } | null
  item: {
    name:        string
    sku_code:    string
    category_id: string
    store_id:    string
    avg_purchase_price: number | null
    unit: { abbreviation: string } | null
  } | null
}

/**
 * Movement lines joined with movement + item, BOUNDED to the report range and
 * deduped per request with React cache().
 *
 * The old version pulled the ENTIRE inv_movement_lines table — and was called
 * separately by consumption, COGS, wastage and slow-moving, so one report page
 * view scanned the whole table several times over. Past PostgREST's 1000-row
 * response cap the scan silently truncated, corrupting every derived number.
 */
const fetchLines = cache(async function fetchLines(from: string, to: string): Promise<JoinedLine[]> {
  const { data, error } = await db().from('inv_movement_lines').select(`
    quantity, unit_price, adjustment_direction,
    movement:inv_movements!inner (movement_type, movement_date, status, store_id, adjustment_reason),
    item:inv_items (name, sku_code, category_id, store_id, avg_purchase_price, unit:inv_units (abbreviation))
  `)
    .gte('movement.movement_date', from)
    .lte('movement.movement_date', to)
    .eq('movement.status', 'completed')
    .limit(10_000)
  if (error) throw new Error(`[reports.inventory] ${error.message}`)
  return (data ?? []) as JoinedLine[]
})

function inRange(date: string, r: DateRange): boolean {
  return date >= r.from && date <= r.to
}

// ── Stock on hand (point-in-time) ────────────────────────────────────────────

export interface StockOnHandRow { store: string; category: string; value: number; skus: number }

export async function getStockOnHand(): Promise<{ rows: StockOnHandRow[]; total: number }> {
  const { data, error } = await db().from('inv_items').select(`
    current_stock, avg_purchase_price,
    category:inv_categories (display_name),
    store:inv_stores (display_name)
  `).eq('is_active', true)
  if (error) throw new Error(`[reports.inventory.stockOnHand] ${error.message}`)

  const map = new Map<string, StockOnHandRow>()
  let total = 0
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const it of (data ?? []) as any[]) {
    const store = it.store?.display_name ?? '—'
    const category = it.category?.display_name ?? '—'
    const value = Number(it.current_stock) * Number(it.avg_purchase_price ?? 0)
    const key = `${store}|${category}`
    const row = map.get(key) ?? { store, category, value: 0, skus: 0 }
    row.value += value; row.skus += 1
    map.set(key, row)
    total += value
  }
  return {
    rows: [...map.values()].sort((a, b) => b.value - a.value).map((r) => ({ ...r, value: Math.round(r.value * 100) / 100 })),
    total: Math.round(total * 100) / 100,
  }
}

// ── Consumption by category (issues, valued at avg cost) ─────────────────────

export interface ConsumptionRow { category: string; quantity: number; value: number }

export async function getConsumptionByCategory(range: DateRange): Promise<{ rows: ConsumptionRow[]; total: number }> {
  const lines = await fetchLines(range.from, range.to)
  const map = new Map<string, ConsumptionRow>()
  let total = 0
  for (const l of lines) {
    if (!l.movement || !l.item) continue
    if (l.movement.status !== 'completed' || l.movement.movement_type !== 'issue') continue
    if (!inRange(l.movement.movement_date, range)) continue
    const value = Number(l.quantity) * Number(l.item.avg_purchase_price ?? 0)
    const key = l.item.category_id
    const row = map.get(key) ?? { category: key, quantity: 0, value: 0 }
    row.quantity += Number(l.quantity); row.value += value
    map.set(key, row)
    total += value
  }
  // Resolve category names
  const ids = [...map.keys()]
  if (ids.length) {
    const { data: cats } = await db().from('inv_categories').select('id, display_name').in('id', ids)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nameById = new Map((cats ?? []).map((c: any) => [c.id, c.display_name]))
    for (const [id, row] of map) row.category = (nameById.get(id) as string) ?? '—'
  }
  return {
    rows: [...map.values()].sort((a, b) => b.value - a.value).map((r) => ({ ...r, value: Math.round(r.value * 100) / 100 })),
    total: Math.round(total * 100) / 100,
  }
}

// ── Cost of goods consumed (kitchen) + food cost % ───────────────────────────

export interface CostOfGoodsResult {
  kitchen_cogs:   number
  fnb_revenue:    number
  food_cost_pct:  number | null
}

export async function getCostOfGoods(range: DateRange): Promise<CostOfGoodsResult> {
  const [lines, { data: kitchenStore }] = await Promise.all([
    fetchLines(range.from, range.to),
    db().from('inv_stores').select('id').eq('slug', 'kitchen').maybeSingle(),
  ])
  const kitchenId = kitchenStore?.id
  let cogs = 0
  for (const l of lines) {
    if (!l.movement || !l.item) continue
    if (l.movement.status !== 'completed' || l.movement.movement_type !== 'issue') continue
    if (l.item.store_id !== kitchenId) continue
    if (!inRange(l.movement.movement_date, range)) continue
    cogs += Number(l.quantity) * Number(l.item.avg_purchase_price ?? 0)
  }

  // F&B revenue proxy: completed coffee-shop sales in the period.
  const { data: sales } = await db().from('coffee_shop_sales')
    .select('net_amount, status, sale_date').eq('status', 'completed')
    .gte('sale_date', range.from).lte('sale_date', range.to)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fnb = ((sales ?? []) as any[]).reduce((s, r) => s + Number(r.net_amount ?? 0), 0)

  return {
    kitchen_cogs:  Math.round(cogs * 100) / 100,
    fnb_revenue:   Math.round(fnb * 100) / 100,
    food_cost_pct: fnb > 0 ? Math.round((cogs / fnb) * 1000) / 10 : null,
  }
}

// ── Wastage (decrease adjustments, by reason) ────────────────────────────────

export interface WastageRow { reason: string; quantity: number; value: number }

export async function getWastage(range: DateRange): Promise<{ rows: WastageRow[]; total: number }> {
  const lines = await fetchLines(range.from, range.to)
  const map = new Map<string, WastageRow>()
  let total = 0
  for (const l of lines) {
    if (!l.movement || !l.item) continue
    if (l.movement.status !== 'completed' || l.movement.movement_type !== 'adjustment') continue
    if (l.adjustment_direction !== 'decrease') continue
    if (!inRange(l.movement.movement_date, range)) continue
    const reason = l.movement.adjustment_reason ?? 'other'
    if (reason === 'recount') continue   // recounts are reconciliation, not wastage
    const value = Number(l.quantity) * Number(l.item.avg_purchase_price ?? 0)
    const row = map.get(reason) ?? { reason, quantity: 0, value: 0 }
    row.quantity += Number(l.quantity); row.value += value
    map.set(reason, row)
    total += value
  }
  return {
    rows: [...map.values()].sort((a, b) => b.value - a.value).map((r) => ({ ...r, value: Math.round(r.value * 100) / 100 })),
    total: Math.round(total * 100) / 100,
  }
}

// ── Slow-moving (no issue in N days, stock > 0) ──────────────────────────────

export interface SlowMovingRow { name: string; sku_code: string; current_stock: number; unit_abbr: string | null; last_issued: string | null }

export async function getSlowMoving(days = 60): Promise<SlowMovingRow[]> {
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - days)
  const cutoffIso = cutoff.toISOString().slice(0, 10)

  // Issue lines only, filtered in SQL via the !inner join — the old version
  // fetched the whole movement-lines table twice (once through fetchLines whose
  // result was never even used, once unfiltered here).
  const [{ data: items }, { data: issueLines }] = await Promise.all([
    db().from('inv_items').select('id, name, sku_code, current_stock, unit:inv_units (abbreviation)')
      .eq('is_active', true).gt('current_stock', 0),
    db().from('inv_movement_lines').select(`
      item_id, movement:inv_movements!inner (movement_type, status, movement_date)
    `)
      .eq('movement.movement_type', 'issue')
      .eq('movement.status', 'completed'),
  ])

  // Most recent completed issue date per item
  const lastIssue = new Map<string, string>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const l of (issueLines ?? []) as any[]) {
    if (!l.movement || l.movement.status !== 'completed' || l.movement.movement_type !== 'issue') continue
    const prev = lastIssue.get(l.item_id)
    if (!prev || l.movement.movement_date > prev) lastIssue.set(l.item_id, l.movement.movement_date)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((items ?? []) as any[])
    .filter((it) => {
      const last = lastIssue.get(it.id)
      return !last || last < cutoffIso
    })
    .map((it) => ({
      name: it.name, sku_code: it.sku_code, current_stock: Number(it.current_stock),
      unit_abbr: it.unit?.abbreviation ?? null, last_issued: lastIssue.get(it.id) ?? null,
    }))
    .sort((a, b) => (a.last_issued ?? '').localeCompare(b.last_issued ?? ''))
}
