'use server'

import { revalidatePath, revalidateTag } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import {
  chargeCategoryFormSchema,
  chargeItemFormSchema,
} from '@/lib/validators/checkout'
import { requirePermission } from '@/lib/auth/permissions'
import type { ActionResult, ActionData } from './types'

async function logHistory(
  entityId: string,
  event: 'created' | 'edited',
  action: string,
  payload: Record<string, unknown> = {},
) {
  try {
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any
    const { error } = await db.from('history_log').insert({
      entity_type: 'charge_item',
      entity_id:   entityId,
      event,
      actor:       'system',
      payload:     { action, ...payload },
    })
    if (error) console.warn(`[history_log] non-fatal: ${error.message}`)
  } catch (err) {
    console.warn(`[history_log] non-fatal:`, err)
  }
}

// ─── Categories ──────────────────────────────────────────────────────────────

export async function createChargeCategory(input: unknown): Promise<ActionData<{ id: string }>> {
  try {
    await requirePermission('settings', 'write')
    const parsed = chargeCategoryFormSchema.parse(input)
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any
    const { data, error } = await db
      .from('charge_categories')
      .insert(parsed)
      .select('id')
      .single()
    if (error || !data) return { success: false, error: error?.message ?? 'Insert failed' }
    revalidateTag('charge-catalog')
    revalidatePath('/settings/charge-catalog')
    return { success: true, data: { id: data.id } }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function updateChargeCategory(id: string, input: unknown): Promise<ActionResult> {
  try {
    await requirePermission('settings', 'write')
    const parsed = chargeCategoryFormSchema.parse(input)
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any
    // Slug locks once used (keep historical references stable)
    const { error } = await db
      .from('charge_categories')
      .update({
        display_name:  parsed.display_name,
        display_order: parsed.display_order,
        is_active:     parsed.is_active,
      })
      .eq('id', id)
    if (error) return { success: false, error: error.message }
    revalidateTag('charge-catalog')
    revalidatePath('/settings/charge-catalog')
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function toggleChargeCategoryActive(id: string): Promise<ActionResult> {
  try {
    await requirePermission('settings', 'write')
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any
    const { data: cur } = await db.from('charge_categories').select('is_active').eq('id', id).single()
    if (!cur) return { success: false, error: 'Category not found' }
    const { error } = await db
      .from('charge_categories')
      .update({ is_active: !cur.is_active })
      .eq('id', id)
    if (error) return { success: false, error: error.message }
    revalidateTag('charge-catalog')
    revalidatePath('/settings/charge-catalog')
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

// ─── Items ──────────────────────────────────────────────────────────────────

export async function createChargeItem(input: unknown): Promise<ActionData<{ id: string }>> {
  try {
    await requirePermission('settings', 'write')
    const parsed = chargeItemFormSchema.parse(input)
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any
    const { data, error } = await db
      .from('charge_items')
      .insert({
        category_id:   parsed.category_id,
        name:          parsed.name,
        default_price: parsed.default_price,
        description:   parsed.description || null,
        display_order: parsed.display_order,
        is_active:     parsed.is_active,
      })
      .select('id')
      .single()
    if (error || !data) return { success: false, error: error?.message ?? 'Insert failed' }
    await logHistory(data.id, 'created', 'charge_item_created', { name: parsed.name })
    revalidateTag('charge-catalog')
    revalidatePath('/settings/charge-catalog')
    return { success: true, data: { id: data.id } }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function updateChargeItem(id: string, input: unknown): Promise<ActionResult> {
  try {
    await requirePermission('settings', 'write')
    const parsed = chargeItemFormSchema.parse(input)
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any
    const { error } = await db
      .from('charge_items')
      .update({
        category_id:   parsed.category_id,
        name:          parsed.name,
        default_price: parsed.default_price,
        description:   parsed.description || null,
        display_order: parsed.display_order,
        is_active:     parsed.is_active,
      })
      .eq('id', id)
    if (error) return { success: false, error: error.message }
    await logHistory(id, 'edited', 'charge_item_edited', { name: parsed.name })
    revalidateTag('charge-catalog')
    revalidatePath('/settings/charge-catalog')
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function toggleChargeItemActive(id: string): Promise<ActionResult> {
  try {
    await requirePermission('settings', 'write')
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any
    const { data: cur } = await db.from('charge_items').select('is_active').eq('id', id).single()
    if (!cur) return { success: false, error: 'Item not found' }
    const { error } = await db
      .from('charge_items')
      .update({ is_active: !cur.is_active })
      .eq('id', id)
    if (error) return { success: false, error: error.message }
    await logHistory(id, 'edited', 'charge_item_toggled', { is_active: !cur.is_active })
    revalidateTag('charge-catalog')
    revalidatePath('/settings/charge-catalog')
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}
