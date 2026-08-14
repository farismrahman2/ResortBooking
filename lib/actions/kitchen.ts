'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission, getCurrentUserContext } from '@/lib/auth/permissions'
import {
  requisitionDraftSchema, requisitionSubmitSchema, approveSchema,
} from '@/lib/validators/kitchen'
import { formatRequisitionNo } from '@/lib/kitchen/requisition-number'
import { getRequisitionById } from '@/lib/queries/kitchen'
import type { ActionResult, ActionData } from './types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const dbc = () => createClient() as any

/** Non-fatal history logging — never blocks the write. */
async function logHistory(
  id: string,
  event: 'created' | 'edited',
  action: string,
  payload: Record<string, unknown> = {},
) {
  try {
    const { error } = await dbc().from('history_log').insert({
      entity_type: 'kitchen_requisition',
      entity_id:   id,
      event,
      actor:       'system',
      payload:     { action, ...payload },
    })
    if (error) console.warn(`[history_log] non-fatal: ${error.message}`)
  } catch (err) {
    console.warn('[history_log] non-fatal:', err)
  }
}

/** Has anything worth persisting been entered? Mirrors the field-visit rule:
 *  merely opening the form must not leave a row behind. */
function hasContent(input: { event_date?: unknown; notes?: unknown; lines?: unknown }): boolean {
  if (typeof input.event_date === 'string' && input.event_date.trim()) return true
  if (typeof input.notes === 'string' && input.notes.trim()) return true
  return Array.isArray(input.lines) && input.lines.length > 0
}

async function nextRequisitionNo(db: ReturnType<typeof dbc>, attempt: number): Promise<string> {
  const { count } = await db.from('kitchen_requisitions').select('id', { count: 'exact', head: true })
  return formatRequisitionNo((count ?? 0) + attempt)
}

/**
 * Create-or-update. The id is minted client-side and the row is created lazily
 * on the first real edit, so opening the form to look at it costs nothing.
 */
export async function saveRequisition(id: string, partial: unknown): Promise<ActionResult> {
  await requirePermission('kitchen', 'write')
  try {
    const db    = dbc()
    const input = requisitionDraftSchema.parse(partial ?? {})
    const { lines, ...header } = input

    const { data: existing } = await db.from('kitchen_requisitions')
      .select('status, requisition_no').eq('id', id).maybeSingle()

    if (!existing) {
      if (!hasContent(input)) return { success: true }   // nothing to save yet
      const ctx = await getCurrentUserContext()
      let created = false
      for (let attempt = 0; attempt < 6 && !created; attempt++) {
        const { error } = await db.from('kitchen_requisitions').insert({
          id,
          requisition_no: await nextRequisitionNo(db, attempt),
          status:         'draft',
          event_date:     header.event_date ?? new Date().toISOString().slice(0, 10),
          is_emergency:   header.is_emergency ?? false,
          parent_requisition_id: header.parent_requisition_id ?? null,
          created_by:     ctx?.user_id ?? null,
        })
        if (!error) { created = true; break }
        if (error.code !== '23505') return { success: false, error: error.message }
      }
      if (!created) return { success: false, error: 'Could not allocate a requisition number' }
    } else if (existing.status !== 'draft') {
      // Once approved the requisition has already gone to the suppliers.
      return { success: false, error: `Cannot edit — this requisition is ${existing.status.replace('_', ' ')}.` }
    }

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (header.event_date !== undefined)   patch.event_date = header.event_date
    if (header.notes !== undefined)        patch.notes = header.notes
    if (header.is_emergency !== undefined) patch.is_emergency = header.is_emergency
    const { error: upErr } = await db.from('kitchen_requisitions').update(patch).eq('id', id)
    if (upErr) return { success: false, error: upErr.message }

    // Lines are replace-all — the form re-sends its whole state on each save.
    if (lines) {
      await db.from('kitchen_requisition_lines').delete().eq('requisition_id', id)
      const rows = lines
        .filter((l) => l.item_name?.trim() && Number(l.qty) > 0)
        .map((l, i) => ({
          requisition_id: id, sort_order: i,
          item_id: l.item_id ?? null, item_name: l.item_name.trim(),
          kitchen_vendor_id: l.kitchen_vendor_id ?? null,
          qty: l.qty, piece_count: l.piece_count ?? null,
          unit_id: l.unit_id ?? null, notes: l.notes ?? null,
          is_extra: l.is_extra ?? false,
        }))
      if (rows.length) {
        const { error } = await db.from('kitchen_requisition_lines').insert(rows)
        if (error) return { success: false, error: error.message }
      }
    }

    revalidatePath('/kitchen/requisitions')
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/** Draft → pending_approval. The only blocking validation on the way in. */
export async function submitRequisition(id: string): Promise<ActionResult> {
  await requirePermission('kitchen', 'write')
  try {
    const db  = dbc()
    const req = await getRequisitionById(id)
    if (!req) return { success: false, error: 'Requisition not found' }
    if (req.status !== 'draft') {
      return { success: false, error: `Already ${req.status.replace('_', ' ')}.` }
    }

    const parsed = requisitionSubmitSchema.safeParse({ event_date: req.event_date, lines: req.lines })
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? 'Incomplete requisition' }
    }

    const { error } = await db.from('kitchen_requisitions')
      .update({ status: 'pending_approval', updated_at: new Date().toISOString() }).eq('id', id)
    if (error) return { success: false, error: error.message }

    await logHistory(id, 'edited', 'submitted_for_approval', {
      requisition_no: req.requisition_no, lines: req.lines.length,
    })
    revalidatePath('/kitchen/requisitions')
    revalidatePath(`/kitchen/requisitions/${id}`)
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * Approve. Records the NAMED person (an employee) as well as which login
 * clicked — the paper form is signed by a person, not by an account.
 */
export async function approveRequisition(id: string, input: unknown): Promise<ActionResult> {
  await requirePermission('kitchen', 'write')
  try {
    const db     = dbc()
    const parsed = approveSchema.safeParse(input)
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid approval' }
    }
    const ctx = await getCurrentUserContext()

    const { data: req } = await db.from('kitchen_requisitions')
      .select('status, requisition_no').eq('id', id).maybeSingle()
    if (!req) return { success: false, error: 'Requisition not found' }
    if (req.status === 'approved')  return { success: false, error: 'Already approved' }
    if (req.status === 'cancelled') return { success: false, error: 'This requisition is cancelled' }

    const { error } = await db.from('kitchen_requisitions').update({
      status:                  'approved',
      approved_by_employee_id: parsed.data.approved_by_employee_id,
      approved_by_user_id:     ctx?.user_id ?? null,
      approved_at:             new Date().toISOString(),
      approval_notes:          parsed.data.approval_notes,
      updated_at:              new Date().toISOString(),
    }).eq('id', id)
    if (error) return { success: false, error: error.message }

    await logHistory(id, 'edited', 'approved', {
      requisition_no: req.requisition_no,
      approver: parsed.data.approved_by_employee_id,
      by_user: ctx?.email ?? null,
    })
    revalidatePath('/kitchen/requisitions')
    revalidatePath(`/kitchen/requisitions/${id}`)
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/** Soft cancel. Approved requisitions can still be cancelled — the goods
 *  simply don't get ordered — but the record and its reason are kept. */
export async function cancelRequisition(id: string, reason: string): Promise<ActionResult> {
  await requirePermission('kitchen', 'write')
  try {
    if (reason.trim().length < 2) return { success: false, error: 'A reason is required' }
    const db = dbc()
    const { data: req } = await db.from('kitchen_requisitions')
      .select('status, requisition_no').eq('id', id).maybeSingle()
    if (!req) return { success: false, error: 'Requisition not found' }
    if (req.status === 'cancelled') return { success: false, error: 'Already cancelled' }

    const { error } = await db.from('kitchen_requisitions').update({
      status: 'cancelled', cancelled_at: new Date().toISOString(),
      cancel_reason: reason.trim(), updated_at: new Date().toISOString(),
    }).eq('id', id)
    if (error) return { success: false, error: error.message }

    await logHistory(id, 'edited', 'cancelled', { requisition_no: req.requisition_no, reason })
    revalidatePath('/kitchen/requisitions')
    revalidatePath(`/kitchen/requisitions/${id}`)
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/** Discard a draft outright — never approved, so nothing of record is lost. */
export async function discardRequisition(id: string): Promise<ActionResult> {
  await requirePermission('kitchen', 'write')
  try {
    const db = dbc()
    const { data: req } = await db.from('kitchen_requisitions')
      .select('status').eq('id', id).maybeSingle()
    if (!req) return { success: true }              // lazy-create never fired
    if (req.status !== 'draft') {
      return { success: false, error: 'Only drafts can be discarded. Cancel this requisition instead.' }
    }
    const { error } = await db.from('kitchen_requisitions').delete().eq('id', id)
    if (error) return { success: false, error: error.message }
    revalidatePath('/kitchen/requisitions')
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/** Tag an item with its vendor from the requisition screen, so the fan-out
 *  improves as people use it rather than needing a separate setup pass. */
export async function setItemVendor(itemId: string, vendorId: string | null): Promise<ActionResult> {
  await requirePermission('kitchen', 'write')
  try {
    const { error } = await dbc().from('inv_items')
      .update({ kitchen_vendor_id: vendorId }).eq('id', itemId)
    if (error) return { success: false, error: error.message }
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * Tag many items at once. Tagging 76 items one dropdown at a time is the kind
 * of chore people abandon halfway, leaving a half-configured system — so the
 * bulk path is the primary one.
 */
export async function setItemVendorBulk(
  itemIds: string[],
  vendorId: string | null,
): Promise<ActionData<{ updated: number }>> {
  await requirePermission('kitchen', 'write')
  try {
    if (itemIds.length === 0) return { success: true, data: { updated: 0 } }
    const { error } = await dbc().from('inv_items')
      .update({ kitchen_vendor_id: vendorId }).in('id', itemIds)
    if (error) return { success: false, error: error.message }
    revalidatePath('/kitchen/items')
    revalidatePath('/kitchen/requisitions')
    return { success: true, data: { updated: itemIds.length } }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}
