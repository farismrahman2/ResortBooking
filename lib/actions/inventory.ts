'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/permissions'
import { itemFormSchema, supplierFormSchema, type ItemFormInput, type SupplierFormInput } from '@/lib/validators/inventory'
import { formatSkuCode, storePrefixFromSlug, categoryPrefixFromSlug } from '@/lib/inventory/sku-generator'
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
