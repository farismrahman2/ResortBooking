'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission, getCurrentUserContext } from '@/lib/auth/permissions'
import { templateSchema } from '@/lib/validators/kitchen'
import { getRequisitionById } from '@/lib/queries/kitchen'
import type { ActionResult, ActionData } from './types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const dbc = () => createClient() as any

/**
 * Create or replace a template.
 *
 * Lines are replace-all, matching the requisition form: the editor holds the
 * whole list in state and re-sends it, so a diff would be more code and more
 * ways to be wrong for no gain at forty rows.
 */
export async function saveTemplate(
  input: unknown, templateId?: string,
): Promise<ActionData<{ id: string }>> {
  await requirePermission('kitchen', 'write')
  try {
    const parsed = templateSchema.safeParse(input)
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? 'Could not save the template' }
    }
    const t  = parsed.data
    const db = dbc()
    const ctx = await getCurrentUserContext()

    const header = {
      name:        t.name,
      description: t.description,
      is_active:   t.is_active,
      updated_at:  new Date().toISOString(),
    }

    let id = templateId ?? null
    if (id) {
      const { error } = await db.from('kitchen_requisition_templates').update(header).eq('id', id)
      // 23505 is the case-insensitive name index — a far more useful message
      // than the raw constraint text.
      if (error) {
        return {
          success: false,
          error: error.code === '23505'
            ? `A template called "${t.name}" already exists.`
            : error.message,
        }
      }
    } else {
      const { data, error } = await db.from('kitchen_requisition_templates')
        .insert({ ...header, created_by: ctx?.user_id ?? null })
        .select('id').single()
      if (error) {
        return {
          success: false,
          error: error.code === '23505'
            ? `A template called "${t.name}" already exists.`
            : error.message,
        }
      }
      id = data.id
    }

    await db.from('kitchen_requisition_template_lines').delete().eq('template_id', id)
    const rows = t.lines
      .filter((l) => l.item_name.trim())
      .map((l, i) => ({
        template_id: id, sort_order: i,
        item_id: l.item_id, item_name: l.item_name.trim(),
        kitchen_vendor_id: l.kitchen_vendor_id,
        qty: l.qty, piece_count: l.piece_count,
        unit_id: l.unit_id, notes: l.notes,
      }))
    if (rows.length) {
      const { error } = await db.from('kitchen_requisition_template_lines').insert(rows)
      if (error) return { success: false, error: error.message }
    }

    revalidatePath('/kitchen/templates')
    revalidatePath('/kitchen/requisitions')
    return { success: true, data: { id: id as string } }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * Snapshot a requisition as a new template — the fastest way to get one.
 *
 * Nobody wants to build a forty-line standing list from an empty screen when
 * yesterday's sheet is already almost exactly it. Extras are dropped: a line
 * added after the original order went out was, by definition, a one-off, and
 * carrying it into the standing list is how templates rot.
 */
export async function saveRequisitionAsTemplate(
  requisitionId: string, name: string,
): Promise<ActionData<{ id: string }>> {
  await requirePermission('kitchen', 'write')
  try {
    const req = await getRequisitionById(requisitionId)
    if (!req) return { success: false, error: 'Requisition not found' }

    const lines = req.lines
      .filter((l) => !l.is_extra && Number(l.qty) > 0)
      .map((l, i) => ({
        sort_order: i,
        item_id: l.item_id, item_name: l.item_name,
        kitchen_vendor_id: l.kitchen_vendor_id,
        qty: Number(l.qty),
        piece_count: l.piece_count,
        unit_id: l.unit_id, notes: l.notes,
      }))
    if (lines.length === 0) {
      return { success: false, error: 'Nothing on this requisition to save.' }
    }

    return saveTemplate({
      name, description: `Saved from ${req.requisition_no}`, is_active: true, lines,
    })
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * Hide a template rather than deleting it.
 *
 * Deleting is offered too, but hiding is usually what people mean: the
 * seasonal list they'll want again in four months. Requisitions already built
 * from it are unaffected either way — lines are copied at load, never linked.
 */
export async function setTemplateActive(id: string, isActive: boolean): Promise<ActionResult> {
  await requirePermission('kitchen', 'write')
  try {
    const { error } = await dbc().from('kitchen_requisition_templates')
      .update({ is_active: isActive, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) return { success: false, error: error.message }
    revalidatePath('/kitchen/templates')
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function deleteTemplate(id: string): Promise<ActionResult> {
  await requirePermission('kitchen', 'write')
  try {
    const { error } = await dbc().from('kitchen_requisition_templates').delete().eq('id', id)
    if (error) return { success: false, error: error.message }
    revalidatePath('/kitchen/templates')
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}
