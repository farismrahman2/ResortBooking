'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/permissions'
import {
  itemFormSchema, supplierFormSchema,
  receiptFormSchema, issueFormSchema, transferFormSchema, adjustmentFormSchema, countFormSchema,
  type ItemFormInput, type SupplierFormInput,
  type ReceiptFormInput, type IssueFormInput, type TransferFormInput, type AdjustmentFormInput,
  type CountFormInput,
} from '@/lib/validators/inventory'
import { formatSkuCode, storePrefixFromSlug, categoryPrefixFromSlug } from '@/lib/inventory/sku-generator'
import { formatMovementNumber, type MovementNumberType } from '@/lib/inventory/movement-number'
import { computeAvgPurchasePrice } from '@/lib/inventory/avg-price'
import { expenseCategoryForStore } from '@/lib/inventory/expense-category-mapping'
import type { ActionResult, ActionData } from './types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const dbc = () => createClient() as any

async function currentUserId(): Promise<string | null> {
  const { data } = await createClient().auth.getUser()
  return data.user?.id ?? null
}

type HistoryEntity = 'inv_item' | 'inv_supplier' | 'inv_movement' | 'inv_count'

async function logHistory(
  entityType: HistoryEntity,
  entityId: string,
  event: 'created' | 'edited',
  payload: Record<string, unknown> = {},
) {
  try {
    const { error } = await dbc().from('history_log').insert({
      entity_type: entityType,
      entity_id:   entityId,
      event,
      actor:       'system',
      payload,
    })
    if (error) console.warn(`[history_log] non-fatal: ${error.message}`)
  } catch (err) {
    console.warn('[history_log] non-fatal:', err)
  }
}

// ─── Items ──────────────────────────────────────────────────────────────────

export async function createItem(
  raw: ItemFormInput,
): Promise<ActionData<{ id: string; sku_code: string }>> {
  await requirePermission('inventory', 'write')
  try {
    const input = itemFormSchema.parse(raw)
    const db = dbc()

    // Resolve store + category slugs for the SKU prefix
    const [{ data: store }, { data: category }] = await Promise.all([
      db.from('inv_stores').select('slug').eq('id', input.store_id).maybeSingle(),
      db.from('inv_categories').select('slug').eq('id', input.category_id).maybeSingle(),
    ])
    if (!store)    return { success: false, error: 'Store not found' }
    if (!category) return { success: false, error: 'Category not found' }

    const storePrefix = storePrefixFromSlug(store.slug)
    const catPrefix   = categoryPrefixFromSlug(category.slug)
    const userId      = await currentUserId()

    // Insert with retry-on-UNIQUE-collision for the auto-generated SKU.
    let created: { id: string; sku_code: string } | null = null
    for (let attempt = 0; attempt < 5 && !created; attempt++) {
      let skuCode = input.sku_code?.trim()
      if (!skuCode) {
        const { count } = await db.from('inv_items')
          .select('id', { count: 'exact', head: true })
          .eq('store_id', input.store_id)
          .eq('category_id', input.category_id)
        skuCode = formatSkuCode(storePrefix, catPrefix, (count ?? 0) + attempt)
      }

      const { data, error } = await db.from('inv_items').insert({
        sku_code:             skuCode,
        store_id:             input.store_id,
        category_id:          input.category_id,
        name:                 input.name,
        description:          input.description ?? null,
        unit_id:              input.unit_id,
        item_type:            input.item_type,
        par_level:            input.par_level ?? null,
        reorder_point:        input.reorder_point ?? null,
        default_supplier_id:  input.default_supplier_id ?? null,
        allow_negative_stock: input.allow_negative_stock,
        notes:                input.notes ?? null,
        created_by:           userId,
      }).select('id, sku_code').single()

      if (!error) { created = data; break }
      // 23505 = unique_violation. If the user supplied an explicit SKU, don't retry.
      if (error.code !== '23505' || input.sku_code) return { success: false, error: error.message }
    }

    if (!created) return { success: false, error: 'Could not generate a unique SKU after several attempts' }

    await logHistory('inv_item', created.id, 'created', { sku_code: created.sku_code, name: input.name })
    revalidatePath('/inventory')
    revalidatePath(`/inventory/${store.slug}`)
    return { success: true, data: created }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function updateItem(id: string, raw: ItemFormInput): Promise<ActionResult> {
  await requirePermission('inventory', 'write')
  try {
    const input = itemFormSchema.parse(raw)
    const db = dbc()
    const update: Record<string, unknown> = {
      name:                 input.name,
      description:          input.description ?? null,
      category_id:          input.category_id,
      unit_id:              input.unit_id,
      item_type:            input.item_type,
      par_level:            input.par_level ?? null,
      reorder_point:        input.reorder_point ?? null,
      default_supplier_id:  input.default_supplier_id ?? null,
      allow_negative_stock: input.allow_negative_stock,
      notes:                input.notes ?? null,
      updated_at:           new Date().toISOString(),
    }
    if (input.sku_code?.trim()) update.sku_code = input.sku_code.trim()

    const { error } = await db.from('inv_items').update(update).eq('id', id)
    if (error) return { success: false, error: error.message }

    await logHistory('inv_item', id, 'edited', { name: input.name })
    revalidatePath('/inventory')
    revalidatePath(`/inventory/items/${id}`)
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function deactivateItem(id: string): Promise<ActionResult> {
  await requirePermission('inventory', 'write')
  try {
    const { error } = await dbc().from('inv_items')
      .update({ is_active: false, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) return { success: false, error: error.message }
    await logHistory('inv_item', id, 'edited', { action: 'deactivated' })
    revalidatePath('/inventory')
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

// ─── Suppliers ────────────────────────────────────────────────────────────────

export async function createSupplier(
  raw: SupplierFormInput,
): Promise<ActionData<{ id: string }>> {
  await requirePermission('inventory', 'write')
  try {
    const input = supplierFormSchema.parse(raw)
    const db = dbc()

    let payeeId = input.expense_payee_id ?? null
    // Auto-create a matching expense payee when none is linked, so receipts
    // (Phase 2) have a payee to charge against.
    if (!payeeId) {
      const { data: payee, error: payeeErr } = await db.from('expense_payees').insert({
        name:       input.name,
        payee_type: 'supplier',
      }).select('id').single()
      if (payeeErr && payeeErr.code !== '23505') {
        // 23505 = a payee with this name already exists; link to it instead.
        return { success: false, error: payeeErr.message }
      }
      if (payee?.id) {
        payeeId = payee.id
      } else {
        const { data: existing } = await db.from('expense_payees')
          .select('id').ilike('name', input.name).maybeSingle()
        payeeId = existing?.id ?? null
      }
    }

    const { data, error } = await db.from('inv_suppliers').insert({
      name:             input.name,
      expense_payee_id: payeeId,
      contact_phone:    input.contact_phone ?? null,
      contact_email:    input.contact_email ?? null,
      contact_address:  input.contact_address ?? null,
      notes:            input.notes ?? null,
    }).select('id').single()
    if (error) return { success: false, error: error.message }

    await logHistory('inv_supplier', data.id, 'created', { name: input.name })
    revalidatePath('/inventory/suppliers')
    return { success: true, data: { id: data.id } }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function updateSupplier(id: string, raw: SupplierFormInput): Promise<ActionResult> {
  await requirePermission('inventory', 'write')
  try {
    const input = supplierFormSchema.parse(raw)
    const { error } = await dbc().from('inv_suppliers').update({
      name:             input.name,
      expense_payee_id: input.expense_payee_id ?? null,
      contact_phone:    input.contact_phone ?? null,
      contact_email:    input.contact_email ?? null,
      contact_address:  input.contact_address ?? null,
      notes:            input.notes ?? null,
      updated_at:       new Date().toISOString(),
    }).eq('id', id)
    if (error) return { success: false, error: error.message }

    await logHistory('inv_supplier', id, 'edited', { name: input.name })
    revalidatePath('/inventory/suppliers')
    revalidatePath(`/inventory/suppliers/${id}`)
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function deactivateSupplier(id: string): Promise<ActionResult> {
  await requirePermission('inventory', 'write')
  try {
    const { error } = await dbc().from('inv_suppliers')
      .update({ is_active: false, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) return { success: false, error: error.message }
    await logHistory('inv_supplier', id, 'edited', { action: 'deactivated' })
    revalidatePath('/inventory/suppliers')
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

// ─── Movements (Phase 2) ──────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

/** Apply a signed delta to an item's stock, enforcing the negative-stock policy. */
async function applyStockDelta(db: Db, itemId: string, delta: number): Promise<ActionResult> {
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

/** Pre-flight: confirm every decrement line can be applied, before any write. */
async function preflightDecrements(
  db: Db,
  decrements: { item_id: string; quantity: number }[],
): Promise<ActionResult> {
  // Sum per item in case the same item appears on multiple lines.
  const need = new Map<string, number>()
  for (const d of decrements) need.set(d.item_id, (need.get(d.item_id) ?? 0) + d.quantity)
  for (const [itemId, qty] of need) {
    const { data: item } = await db.from('inv_items')
      .select('current_stock, allow_negative_stock, name').eq('id', itemId).maybeSingle()
    if (!item) return { success: false, error: 'Item not found' }
    if (!item.allow_negative_stock && Number(item.current_stock) - qty < 0) {
      return { success: false, error: `Insufficient stock for ${item.name} (have ${item.current_stock}, need ${qty})` }
    }
  }
  return { success: true }
}

/** Recompute last + weighted-average purchase price from non-voided receipts.
 *  Filters in JS (not via embedded SQL filters) — embedded !inner filters don't
 *  reliably cascade in our PostgREST version. */
async function recomputePurchasePrices(db: Db, itemId: string): Promise<void> {
  const { data } = await db.from('inv_movement_lines')
    .select('quantity, unit_price, movement:inv_movements (movement_type, status, movement_date, created_at)')
    .eq('item_id', itemId)
  const receipts = ((data ?? []) as Array<{ quantity: number; unit_price: number; movement: { movement_type: string; status: string; movement_date: string; created_at: string } | null }>)
    .filter((r) => r.movement && r.movement.movement_type === 'receipt' && r.movement.status === 'completed')
    .map((r) => ({ qty: Number(r.quantity), price: Number(r.unit_price), date: r.movement!.movement_date, created: r.movement!.created_at }))
    .sort((a, b) => b.date.localeCompare(a.date) || b.created.localeCompare(a.created))

  const last = receipts[0]?.price ?? null
  const avg  = computeAvgPurchasePrice(receipts.map((r) => ({ qty: r.qty, price: r.price })))
  await db.from('inv_items')
    .update({ last_purchase_price: last, avg_purchase_price: avg, updated_at: new Date().toISOString() })
    .eq('id', itemId)
}

/** Insert a movement header, retrying the number on UNIQUE collision. */
async function insertMovementHeader(
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

async function storeSlug(db: Db, storeId: string): Promise<string | null> {
  const { data } = await db.from('inv_stores').select('slug').eq('id', storeId).maybeSingle()
  return data?.slug ?? null
}

// ── Receipt ────────────────────────────────────────────────────────────────

export async function createReceipt(raw: ReceiptFormInput): Promise<ActionData<{ id: string; movement_number: string }>> {
  await requirePermission('inventory', 'write')
  try {
    const input = receiptFormSchema.parse(raw)
    const db = dbc()
    const userId = await currentUserId()
    const total_value = Math.round(input.lines.reduce((s, l) => s + l.quantity * l.unit_price, 0) * 100) / 100

    const header = await insertMovementHeader(db, 'receipt', input.movement_date, {
      movement_type:  'receipt',
      movement_date:  input.movement_date,
      store_id:       input.store_id,
      supplier_id:    input.supplier_id,
      invoice_number: input.invoice_number ?? null,
      invoice_date:   input.invoice_date ?? null,
      total_value,
      notes:          input.notes ?? null,
      created_by:     userId,
    })
    if ('error' in header) return { success: false, error: header.error }

    const lineRows = input.lines.map((l, idx) => ({
      movement_id: header.id, item_id: l.item_id, quantity: l.quantity,
      unit_price: l.unit_price, notes: l.notes ?? null, display_order: idx,
    }))
    const { error: linesErr } = await db.from('inv_movement_lines').insert(lineRows)
    if (linesErr) {
      await db.from('inv_movements').delete().eq('id', header.id)
      return { success: false, error: linesErr.message }
    }

    // Apply stock + refresh prices per item
    for (const l of input.lines) {
      await applyStockDelta(db, l.item_id, l.quantity)
    }
    const uniqueItems = [...new Set(input.lines.map((l) => l.item_id))]
    for (const itemId of uniqueItems) await recomputePurchasePrices(db, itemId)

    // Auto-create the linked expense (the integration spine). source_module/
    // source_id on the expense is authoritative; expense_id on the movement is
    // a convenience cache for O(1) reversal.
    let expenseId: string | null = null
    if (total_value > 0) {
      const slug = await storeSlug(db, input.store_id)
      const { categorySlug } = expenseCategoryForStore(slug ?? 'housekeeping')
      const [{ data: cat }, { data: supplier }] = await Promise.all([
        db.from('expense_categories').select('id').eq('slug', categorySlug).maybeSingle(),
        db.from('inv_suppliers').select('name, expense_payee_id').eq('id', input.supplier_id).maybeSingle(),
      ])
      if (cat?.id) {
        const { data: expense, error: expErr } = await db.from('expenses').insert({
          expense_date:   input.movement_date,
          category_id:    cat.id,
          payee_id:       supplier?.expense_payee_id ?? null,
          amount:         total_value,
          payment_method: 'cash',
          description:    `Inventory receipt ${header.movement_number}${supplier?.name ? ` from ${supplier.name}` : ''}`,
          notes:          `Auto-created from inventory receipt ${header.movement_number}`,
          is_draft:       false,
          source_module:  'inventory',
          source_id:      header.id,
          created_by:     userId,
        }).select('id').single()
        if (expErr) {
          // Roll back the whole receipt so we never leave un-costed stock.
          for (const l of input.lines) await applyStockDelta(db, l.item_id, -l.quantity)
          for (const itemId of uniqueItems) await recomputePurchasePrices(db, itemId)
          await db.from('inv_movements').delete().eq('id', header.id)
          return { success: false, error: `Expense creation failed: ${expErr.message}` }
        }
        expenseId = expense.id
        await db.from('inv_movements').update({ expense_id: expenseId }).eq('id', header.id)
      }
    }

    await logHistory('inv_movement', header.id, 'created', { type: 'receipt', total_value, expense_id: expenseId })
    revalidateInventory(await storeSlug(db, input.store_id))
    revalidatePath('/expenses')
    return { success: true, data: header }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

// ── Issue ────────────────────────────────────────────────────────────────────

export async function createIssue(raw: IssueFormInput): Promise<ActionData<{ id: string; movement_number: string }>> {
  await requirePermission('inventory', 'write')
  try {
    const input = issueFormSchema.parse(raw)
    const db = dbc()
    const userId = await currentUserId()

    const pre = await preflightDecrements(db, input.lines)
    if (!pre.success) return pre

    const total_value = 0
    const header = await insertMovementHeader(db, 'issue', input.movement_date, {
      movement_type: 'issue', movement_date: input.movement_date, store_id: input.store_id,
      issued_to_department: input.issued_to_department, total_value, notes: input.notes ?? null, created_by: userId,
    })
    if ('error' in header) return { success: false, error: header.error }

    const lineRows = input.lines.map((l, idx) => ({
      movement_id: header.id, item_id: l.item_id, quantity: l.quantity, notes: l.notes ?? null, display_order: idx,
    }))
    const { error: linesErr } = await db.from('inv_movement_lines').insert(lineRows)
    if (linesErr) { await db.from('inv_movements').delete().eq('id', header.id); return { success: false, error: linesErr.message } }

    for (const l of input.lines) await applyStockDelta(db, l.item_id, -l.quantity)

    await logHistory('inv_movement', header.id, 'created', { type: 'issue', dept: input.issued_to_department })
    revalidateInventory(await storeSlug(db, input.store_id))
    return { success: true, data: header }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

// ── Transfer ───────────────────────────────────────────────────────────────

export async function createTransfer(raw: TransferFormInput): Promise<ActionData<{ id: string; movement_number: string }>> {
  await requirePermission('inventory', 'write')
  try {
    const input = transferFormSchema.parse(raw)
    const db = dbc()
    const userId = await currentUserId()

    const pre = await preflightDecrements(db, input.lines)
    if (!pre.success) return pre

    const header = await insertMovementHeader(db, 'transfer', input.movement_date, {
      movement_type: 'transfer', movement_date: input.movement_date, store_id: input.store_id,
      transfer_to_store_id: input.transfer_to_store_id, total_value: 0, notes: input.notes ?? null, created_by: userId,
    })
    if ('error' in header) return { success: false, error: header.error }

    const lineRows = input.lines.map((l, idx) => ({
      movement_id: header.id, item_id: l.item_id, quantity: l.quantity, notes: l.notes ?? null, display_order: idx,
    }))
    const { error: linesErr } = await db.from('inv_movement_lines').insert(lineRows)
    if (linesErr) { await db.from('inv_movements').delete().eq('id', header.id); return { success: false, error: linesErr.message } }

    // Decrement origin item; increment a same-named active item in the
    // destination store if one exists (items are store-scoped, so a twin must
    // already exist for the destination side to move).
    for (const l of input.lines) {
      await applyStockDelta(db, l.item_id, -l.quantity)
      const { data: origin } = await db.from('inv_items').select('name').eq('id', l.item_id).maybeSingle()
      if (origin?.name) {
        const { data: twin } = await db.from('inv_items')
          .select('id').eq('store_id', input.transfer_to_store_id).ilike('name', origin.name)
          .eq('is_active', true).maybeSingle()
        if (twin?.id) await applyStockDelta(db, twin.id, l.quantity)
      }
    }

    await logHistory('inv_movement', header.id, 'created', { type: 'transfer', to: input.transfer_to_store_id })
    revalidateInventory(await storeSlug(db, input.store_id))
    revalidateInventory(await storeSlug(db, input.transfer_to_store_id))
    return { success: true, data: header }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

// ── Adjustment ───────────────────────────────────────────────────────────────

export async function createAdjustment(raw: AdjustmentFormInput): Promise<ActionData<{ id: string; movement_number: string }>> {
  await requirePermission('inventory', 'write')
  try {
    const input = adjustmentFormSchema.parse(raw)
    const db = dbc()
    const userId = await currentUserId()

    const decrements = input.lines.filter((l) => l.adjustment_direction === 'decrease')
    const pre = await preflightDecrements(db, decrements)
    if (!pre.success) return pre

    const header = await insertMovementHeader(db, 'adjustment', input.movement_date, {
      movement_type: 'adjustment', movement_date: input.movement_date, store_id: input.store_id,
      adjustment_reason: input.adjustment_reason, total_value: 0, notes: input.notes ?? null, created_by: userId,
    })
    if ('error' in header) return { success: false, error: header.error }

    const lineRows = input.lines.map((l, idx) => ({
      movement_id: header.id, item_id: l.item_id, quantity: l.quantity,
      adjustment_direction: l.adjustment_direction, notes: l.notes ?? null, display_order: idx,
    }))
    const { error: linesErr } = await db.from('inv_movement_lines').insert(lineRows)
    if (linesErr) { await db.from('inv_movements').delete().eq('id', header.id); return { success: false, error: linesErr.message } }

    for (const l of input.lines) {
      await applyStockDelta(db, l.item_id, l.adjustment_direction === 'increase' ? l.quantity : -l.quantity)
    }

    await logHistory('inv_movement', header.id, 'created', { type: 'adjustment', reason: input.adjustment_reason })
    revalidateInventory(await storeSlug(db, input.store_id))
    return { success: true, data: header }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

// ── Void ─────────────────────────────────────────────────────────────────────

export async function voidMovement(id: string, reason: string): Promise<ActionResult> {
  await requirePermission('inventory', 'write')
  try {
    const db = dbc()
    const userId = await currentUserId()

    const { data: m } = await db.from('inv_movements').select('*').eq('id', id).maybeSingle()
    if (!m) return { success: false, error: 'Movement not found' }
    if (m.status === 'voided') return { success: false, error: 'Already voided' }

    const { data: lines } = await db.from('inv_movement_lines').select('*').eq('movement_id', id)
    const allLines = (lines ?? []) as Array<{ item_id: string; quantity: number; adjustment_direction: string | null }>

    // Reverse the stock impact of each line.
    for (const l of allLines) {
      const qty = Number(l.quantity)
      if (m.movement_type === 'receipt') {
        await applyStockDelta(db, l.item_id, -qty)
      } else if (m.movement_type === 'issue') {
        await applyStockDelta(db, l.item_id, qty)
      } else if (m.movement_type === 'transfer') {
        await applyStockDelta(db, l.item_id, qty)  // restore origin
        const { data: origin } = await db.from('inv_items').select('name').eq('id', l.item_id).maybeSingle()
        if (origin?.name && m.transfer_to_store_id) {
          const { data: twin } = await db.from('inv_items')
            .select('id').eq('store_id', m.transfer_to_store_id).ilike('name', origin.name)
            .eq('is_active', true).maybeSingle()
          if (twin?.id) await applyStockDelta(db, twin.id, -qty)
        }
      } else if (m.movement_type === 'adjustment') {
        await applyStockDelta(db, l.item_id, l.adjustment_direction === 'increase' ? -qty : qty)
      }
    }

    // Mark voided
    const { error: voidErr } = await db.from('inv_movements').update({
      status: 'voided', voided_at: new Date().toISOString(), voided_by: userId, void_reason: reason,
    }).eq('id', id)
    if (voidErr) return { success: false, error: voidErr.message }

    // Receipts: delete the linked expense + recompute prices from remaining receipts.
    if (m.movement_type === 'receipt') {
      if (m.expense_id) await db.from('expenses').delete().eq('id', m.expense_id)
      const uniqueItems = [...new Set(allLines.map((l) => l.item_id))]
      for (const itemId of uniqueItems) await recomputePurchasePrices(db, itemId)
    }

    await logHistory('inv_movement', id, 'edited', { action: 'voided', reason })
    revalidateInventory(await storeSlug(db, m.store_id))
    if (m.transfer_to_store_id) revalidateInventory(await storeSlug(db, m.transfer_to_store_id))
    revalidatePath('/expenses')
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

function revalidateInventory(slug: string | null) {
  revalidatePath('/inventory')
  if (slug) revalidatePath(`/inventory/${slug}`)
  revalidatePath('/inventory/movements')
  revalidatePath('/inventory/low-stock')
}

// ─── Counts (Phase 3) ─────────────────────────────────────────────────────────

export async function startCount(raw: CountFormInput): Promise<ActionData<{ id: string }>> {
  await requirePermission('inventory', 'write')
  try {
    const input = countFormSchema.parse(raw)
    const db = dbc()
    const userId = await currentUserId()
    const today = new Date().toISOString().slice(0, 10)

    // Snapshot the active items in scope
    let itemQ = db.from('inv_items').select('id, current_stock').eq('store_id', input.store_id).eq('is_active', true)
    if (input.category_id) itemQ = itemQ.eq('category_id', input.category_id)
    const { data: items } = await itemQ
    if (!items || items.length === 0) return { success: false, error: 'No active items to count in this scope' }

    // Number with retry
    let countId: string | null = null
    let countNumber = ''
    for (let attempt = 0; attempt < 5 && !countId; attempt++) {
      const { count } = await db.from('inv_counts').select('id', { count: 'exact', head: true }).eq('count_date', today)
      countNumber = formatMovementNumber('count', today, (count ?? 0) + attempt)
      const { data, error } = await db.from('inv_counts').insert({
        count_number: countNumber, store_id: input.store_id, category_id: input.category_id ?? null,
        count_date: today, notes: input.notes ?? null, created_by: userId,
      }).select('id').single()
      if (!error) { countId = data.id; break }
      if (error.code !== '23505') return { success: false, error: error.message }
    }
    if (!countId) return { success: false, error: 'Could not generate a unique count number' }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lineRows = (items as any[]).map((it) => ({
      count_id: countId, item_id: it.id, system_qty: Number(it.current_stock),
    }))
    const { error: linesErr } = await db.from('inv_count_lines').insert(lineRows)
    if (linesErr) { await db.from('inv_counts').delete().eq('id', countId); return { success: false, error: linesErr.message } }

    await logHistory('inv_count', countId, 'created', { count_number: countNumber, items: lineRows.length })
    revalidatePath('/inventory/counts')
    return { success: true, data: { id: countId } }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function recordCountedQty(countId: string, itemId: string, qty: number | null): Promise<ActionResult> {
  await requirePermission('inventory', 'write')
  try {
    const db = dbc()
    const userId = await currentUserId()
    const { error } = await db.from('inv_count_lines').update({
      counted_qty: qty, counted_at: qty == null ? null : new Date().toISOString(), counted_by: qty == null ? null : userId,
    }).eq('count_id', countId).eq('item_id', itemId)
    if (error) return { success: false, error: error.message }
    revalidatePath(`/inventory/counts/${countId}`)
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function bulkMarkMatching(countId: string): Promise<ActionResult> {
  await requirePermission('inventory', 'write')
  try {
    const db = dbc()
    const userId = await currentUserId()
    const { data: lines } = await db.from('inv_count_lines').select('id, system_qty, counted_qty').eq('count_id', countId)
    const now = new Date().toISOString()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const unmarked = ((lines ?? []) as any[]).filter((l) => l.counted_qty == null)
    for (const l of unmarked) {
      await db.from('inv_count_lines').update({ counted_qty: l.system_qty, counted_at: now, counted_by: userId }).eq('id', l.id)
    }
    revalidatePath(`/inventory/counts/${countId}`)
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function finalizeCount(countId: string): Promise<ActionResult> {
  await requirePermission('inventory', 'write')
  try {
    const db = dbc()
    const userId = await currentUserId()

    const { data: count } = await db.from('inv_counts').select('*').eq('id', countId).maybeSingle()
    if (!count) return { success: false, error: 'Count not found' }
    if (count.status !== 'in_progress') return { success: false, error: 'Count is not in progress' }

    const { data: lines } = await db.from('inv_count_lines').select('item_id, counted_qty, system_qty').eq('count_id', countId)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const counted = ((lines ?? []) as any[]).filter((l) => l.counted_qty != null)
    if (counted.length === 0) return { success: false, error: 'Record at least one counted quantity before finalizing' }

    const variances = counted
      .map((l) => ({ item_id: l.item_id as string, variance: Number(l.counted_qty) - Number(l.system_qty) }))
      .filter((v) => Math.abs(v.variance) > 0.0001)

    let adjustmentId: string | null = null
    const today = new Date().toISOString().slice(0, 10)

    if (variances.length > 0) {
      const header = await insertMovementHeader(db, 'adjustment', today, {
        movement_type: 'adjustment', movement_date: today, store_id: count.store_id,
        adjustment_reason: 'recount', total_value: 0,
        notes: `Auto-generated from count ${count.count_number}`, created_by: userId,
      })
      if ('error' in header) return { success: false, error: header.error }
      adjustmentId = header.id

      const lineRows = variances.map((v, idx) => ({
        movement_id: header.id, item_id: v.item_id, quantity: Math.abs(v.variance),
        adjustment_direction: v.variance > 0 ? 'increase' : 'decrease', display_order: idx,
      }))
      await db.from('inv_movement_lines').insert(lineRows)
      for (const v of variances) await applyStockDelta(db, v.item_id, v.variance)
      await logHistory('inv_movement', header.id, 'created', { type: 'adjustment', reason: 'recount', from_count: count.count_number })
    }

    const { error: finErr } = await db.from('inv_counts').update({
      status: 'finalized', finalized_at: new Date().toISOString(), finalized_by: userId,
      adjustment_movement_id: adjustmentId,
    }).eq('id', countId)
    if (finErr) return { success: false, error: finErr.message }

    await logHistory('inv_count', countId, 'edited', { action: 'finalized', adjustments: variances.length })
    const slug = await storeSlug(db, count.store_id)
    revalidateInventory(slug)
    revalidatePath(`/inventory/counts/${countId}`)
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function cancelCount(countId: string): Promise<ActionResult> {
  await requirePermission('inventory', 'write')
  try {
    const { error } = await dbc().from('inv_counts')
      .update({ status: 'cancelled' }).eq('id', countId).eq('status', 'in_progress')
    if (error) return { success: false, error: error.message }
    await logHistory('inv_count', countId, 'edited', { action: 'cancelled' })
    revalidatePath('/inventory/counts')
    revalidatePath(`/inventory/counts/${countId}`)
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}
