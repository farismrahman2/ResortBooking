import 'server-only'
import { formatMovementNumber, type MovementNumberType } from '@/lib/inventory/movement-number'
import type { ActionResult } from '@/lib/actions/types'

/**
 * The stock engine, shared by the inventory actions and the coffee-shop sale
 * flow. Plain server module (NOT 'use server') so nothing here becomes an
 * endpoint — callers do their own permission checks.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Db = any

/** Apply a signed delta to an item's stock, enforcing the negative-stock policy. */
export async function applyStockDelta(db: Db, itemId: string, delta: number): Promise<ActionResult> {
  const { data: item } = await db.from('inv_items')
    .select('current_stock, allow_negative_stock, name').eq('id', itemId).maybeSingle()
  if (!item) return { success: false, error: 'Item not found' }
  const next = Math.round((Number(item.current_stock) + delta) * 1000) / 1000
  if (next < 0 && !item.allow_negative_stock) {
    return { success: false, error: `Insufficient stock for ${item.name} (have ${item.current_stock}, change ${delta})` }
  }
  const { error } = await db.from('inv_items')
    .update({ current_stock: next, updated_at: new Date().toISOString() }).eq('id', itemId)
  if (error) return { success: false, error: error.message }
  return { success: true }
}

/**
 * Apply a set of stock changes as one unit: on any failure, the deltas already
 * applied are reversed and the failure is RETURNED.
 */
export async function applyStockDeltas(
  db: Db,
  deltas: Array<{ item_id: string; delta: number }>,
): Promise<ActionResult> {
  const applied: Array<{ item_id: string; delta: number }> = []
  for (const d of deltas) {
    if (d.delta === 0) continue
    const res = await applyStockDelta(db, d.item_id, d.delta)
    if (!res.success) {
      for (const a of applied.reverse()) {
        await applyStockDelta(db, a.item_id, -a.delta)   // best-effort unwind
      }
      return res
    }
    applied.push(d)
  }
  return { success: true }
}

/** Insert a movement header with number-collision retry. */
export async function insertMovementHeader(
  db: Db,
  type: MovementNumberType,
  date: string,
  row: Record<string, unknown>,
): Promise<{ id: string; movement_number: string } | { error: string }> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const { count } = await db.from('inv_movements')
      .select('id', { count: 'exact', head: true })
      .eq('movement_type', type === 'count' ? 'adjustment' : type)
      .eq('movement_date', date)
    const movementNumber = formatMovementNumber(type, date, (count ?? 0) + attempt)
    const { data, error } = await db.from('inv_movements')
      .insert({ ...row, movement_number: movementNumber }).select('id, movement_number').single()
    if (!error) return data
    if (error.code !== '23505') return { error: error.message }
  }
  return { error: 'Could not generate a unique movement number' }
}

/**
 * One checked unit: an ISSUE movement (goods leaving a store) with its lines
 * and the stock deducted. Rolls the header back if lines or stock fail.
 * Used by the coffee-shop sale flow; the inventory module's own issue action
 * keeps its richer path (preflight, department field, history log).
 */
export async function createIssueMovement(db: Db, input: {
  store_id:   string
  date:       string
  department: string
  notes:      string | null
  created_by: string | null
  lines:      Array<{ item_id: string; quantity: number }>
}): Promise<{ success: true; movement_id: string } | { success: false; error: string }> {
  const lines = input.lines.filter((l) => l.quantity > 0)
  if (lines.length === 0) return { success: false, error: 'Nothing to issue' }

  const header = await insertMovementHeader(db, 'issue', input.date, {
    movement_type: 'issue', movement_date: input.date, store_id: input.store_id,
    issued_to_department: input.department, total_value: 0,
    notes: input.notes, created_by: input.created_by,
  })
  if ('error' in header) return { success: false, error: header.error }

  const { error: linesErr } = await db.from('inv_movement_lines').insert(
    lines.map((l, idx) => ({
      movement_id: header.id, item_id: l.item_id, quantity: l.quantity, display_order: idx,
    })),
  )
  if (linesErr) {
    await db.from('inv_movements').delete().eq('id', header.id)
    return { success: false, error: linesErr.message }
  }

  const stockRes = await applyStockDeltas(db, lines.map((l) => ({ item_id: l.item_id, delta: -l.quantity })))
  if (!stockRes.success) {
    await db.from('inv_movements').delete().eq('id', header.id)
    return { success: false, error: stockRes.error ?? 'Stock update failed' }
  }
  return { success: true, movement_id: header.id }
}

/**
 * Reverse a previously created ISSUE movement (stock back in) and mark it
 * voided. Internal counterpart to the inventory module's voidMovement, without
 * its permission gate — for system-generated movements (sale edits/voids).
 */
export async function reverseIssueMovement(
  db: Db, movementId: string, reason: string,
): Promise<ActionResult> {
  const { data: m } = await db.from('inv_movements')
    .select('id, status, movement_type').eq('id', movementId).maybeSingle()
  if (!m || m.status === 'voided') return { success: true }   // already gone — nothing to reverse
  if (m.movement_type !== 'issue') return { success: false, error: 'Not an issue movement' }

  const { data: claimed, error: claimErr } = await db.from('inv_movements').update({
    status: 'voided', voided_at: new Date().toISOString(), void_reason: reason,
  }).eq('id', movementId).neq('status', 'voided').select('id')
  if (claimErr) return { success: false, error: claimErr.message }
  if (!claimed?.length) return { success: true }

  const { data: lines } = await db.from('inv_movement_lines')
    .select('item_id, quantity').eq('movement_id', movementId)
  const stockRes = await applyStockDeltas(db,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ((lines ?? []) as any[]).map((l) => ({ item_id: l.item_id, delta: Number(l.quantity) })))
  if (!stockRes.success) {
    await db.from('inv_movements').update({ status: m.status, voided_at: null, void_reason: null })
      .eq('id', movementId)
    return { success: false, error: stockRes.error ?? 'Could not restore stock' }
  }
  return { success: true }
}
