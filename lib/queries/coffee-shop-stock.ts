import { createClient } from '@/lib/supabase/server'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createClient() as any

export interface CoffeeStockRow {
  item_id:        string
  name:           string
  unit_abbr:      string | null
  current_stock:  number
  /** Receipts into the store during the range. */
  entered:        number
  last_entered:   string | null   // most recent receipt date, all-time
  /** Units deducted by PAID sale lines during the range. */
  sold:           number
  /** Units deducted by COMPLIMENTARY sale lines during the range. */
  comp:           number
  /** Manual issues to departments (staff use etc.) during the range. */
  issued_other:   number
  /** Signed manual adjustments (wastage etc.), excluding count recounts. */
  adjusted:       number
  /** Signed count-variance total during the range — book vs physical.
   *  Negative = physically SHORT of the book: the leakage number. */
  count_variance: number
}

export interface CoffeeStockReport {
  storeId: string
  rows:    CoffeeStockRow[]
}

/**
 * The leakage sheet: for every Coffee Shop stock item, what entered, what the
 * till says left (paid vs complimentary split), what was manually issued or
 * written off — and what the physical counts say versus the book. A negative
 * count variance is stock that left the shelf with no sale, no comp, and no
 * write-off recorded: leakage.
 *
 * Returns null when the Coffee Shop store doesn't exist yet (migration 002).
 */
export async function getCoffeeShopStockReport(
  fromIso: string, toIso: string,
): Promise<CoffeeStockReport | null> {
  const { data: store } = await db().from('inv_stores')
    .select('id').eq('slug', 'coffee_shop').maybeSingle()
  if (!store?.id) return null

  const { data: items, error: itemsErr } = await db().from('inv_items')
    .select('id, name, current_stock, unit:inv_units (abbreviation)')
    .eq('store_id', store.id).eq('is_active', true)
    .order('name')
  if (itemsErr) throw new Error(`[coffeeStock] ${itemsErr.message}`)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const itemRows = (items ?? []) as any[]
  if (itemRows.length === 0) return { storeId: store.id, rows: [] }
  const itemIds = itemRows.map((i) => i.id)

  const [{ data: moveLines }, { data: lastReceipts }, { data: saleLines }] = await Promise.all([
    // All non-voided movement lines touching these items in the range.
    db().from('inv_movement_lines')
      .select(`
        item_id, quantity, adjustment_direction,
        movement:inv_movements!inner (movement_type, movement_date, status, adjustment_reason, issued_to_department)
      `)
      .in('item_id', itemIds)
      .gte('movement.movement_date', fromIso)
      .lte('movement.movement_date', toIso)
      .eq('movement.status', 'completed')
      .limit(10_000),
    // Most recent receipt per item, all-time ("when did this last enter").
    db().from('inv_movement_lines')
      .select('item_id, movement:inv_movements!inner (movement_type, movement_date, status)')
      .in('item_id', itemIds)
      .eq('movement.movement_type', 'receipt')
      .eq('movement.status', 'completed')
      .limit(10_000),
    // Paid vs complimentary units, from the till itself.
    db().from('coffee_shop_sale_items')
      .select(`
        quantity, is_complimentary,
        charge_item:charge_items!inner (inv_item_id),
        sale:coffee_shop_sales!inner (sale_date, status)
      `)
      .in('charge_item.inv_item_id', itemIds)
      .eq('sale.status', 'completed')
      .gte('sale.sale_date', fromIso)
      .lte('sale.sale_date', toIso)
      .limit(10_000),
  ])

  const byId = new Map<string, CoffeeStockRow>(itemRows.map((i) => [i.id, {
    item_id:       i.id,
    name:          i.name,
    unit_abbr:     i.unit?.abbreviation ?? null,
    current_stock: Number(i.current_stock),
    entered: 0, last_entered: null, sold: 0, comp: 0,
    issued_other: 0, adjusted: 0, count_variance: 0,
  }]))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const l of ((moveLines ?? []) as any[])) {
    const row = byId.get(l.item_id)
    const m = l.movement
    if (!row || !m || m.status !== 'completed') continue
    const qty = Number(l.quantity)
    if (m.movement_type === 'receipt') {
      row.entered += qty
    } else if (m.movement_type === 'issue') {
      // Sales-driven issues are counted from the till below (they carry the
      // paid/comp split); only manual issues land here.
      if (m.issued_to_department !== 'coffee_shop_sale') row.issued_other += qty
    } else if (m.movement_type === 'adjustment') {
      const signed = l.adjustment_direction === 'increase' ? qty : -qty
      if (m.adjustment_reason === 'recount') row.count_variance += signed
      else row.adjusted += signed
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const l of ((lastReceipts ?? []) as any[])) {
    const row = byId.get(l.item_id)
    if (!row || !l.movement) continue
    const d = l.movement.movement_date as string
    if (!row.last_entered || d > row.last_entered) row.last_entered = d
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const s of ((saleLines ?? []) as any[])) {
    const invId = s.charge_item?.inv_item_id
    const row = invId ? byId.get(invId) : null
    if (!row) continue
    if (s.is_complimentary) row.comp += Number(s.quantity)
    else row.sold += Number(s.quantity)
  }

  return { storeId: store.id, rows: [...byId.values()] }
}
