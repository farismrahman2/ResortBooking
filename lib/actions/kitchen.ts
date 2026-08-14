'use server'

import { revalidatePath, revalidateTag } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission, getCurrentUserContext } from '@/lib/auth/permissions'
import {
  requisitionDraftSchema, requisitionSubmitSchema, approveSchema, vendorSchema,
  kitchenItemCreateSchema, kitchenItemUpdateSchema, noNegativeLines,
} from '@/lib/validators/kitchen'
import { formatRequisitionNo, formatAmendmentNo } from '@/lib/kitchen/requisition-number'
import { joinItemName } from '@/lib/kitchen/item-name'
import { getRequisitionById, KITCHEN_CATALOGUE_TAG } from '@/lib/queries/kitchen'
import { getDayMealHeadcounts } from '@/lib/queries/menus'
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
    const db = dbc()
    // safeParse, not parse: a thrown ZodError's .message is the raw issue JSON,
    // which is what the user ended up reading on screen.
    const parsedInput = requisitionDraftSchema.safeParse(partial ?? {})
    if (!parsedInput.success) {
      return { success: false, error: parsedInput.error.issues[0]?.message ?? 'Could not save' }
    }
    const input = parsedInput.data
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
    // event_date is NOT NULL. The zod schema turns an empty date input into
    // `null` (not undefined), so a `!== undefined` guard let that null through
    // and the UPDATE wiped the value the INSERT had just defaulted — every
    // autosave before a date was picked failed with a not-null violation.
    // Only write a real date; leave the existing one alone otherwise.
    if (header.event_date)                 patch.event_date = header.event_date
    if (header.notes !== undefined)        patch.notes = header.notes
    // is_emergency is NOT NULL too — a null here would fail the same way.
    if (typeof header.is_emergency === 'boolean') patch.is_emergency = header.is_emergency
    const { error: upErr } = await db.from('kitchen_requisitions').update(patch).eq('id', id)
    if (upErr) return { success: false, error: upErr.message }

    // Lines are replace-all — the form re-sends its whole state on each save.
    if (lines) {
      await db.from('kitchen_requisition_lines').delete().eq('requisition_id', id)
      // `!== 0`, not `> 0`: an amendment line of "-2 kg" is a real instruction
      // to cancel part of an order, and dropping it here would silently
      // discard exactly the change somebody came to record.
      const rows = lines
        .filter((l) => l.item_name?.trim() && Number(l.qty) !== 0)
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
    // Negative quantities are the amendment mechanism and are meaningless on a
    // first order — a "-2 kg" line there would reach the supplier as a request
    // to deliver minus two kilos.
    if (!req.parent_requisition_id) {
      const bad = noNegativeLines(req.lines)
      if (bad) return { success: false, error: bad }
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
export interface DayPax {
  /** Largest single sitting of the day — what the kitchen actually cooks for. */
  peak:      number
  bookings:  number
  meals:     Array<{ label: string; total: number }>
}

/**
 * How many people are on site on a given day.
 *
 * The requisition never asked this, which is the module's biggest blind spot:
 * a resort kitchen orders for pax, and the person filling the sheet was
 * working from memory of who is checking in. The numbers already exist — the
 * menus module derives them from live bookings with the same meal engine the
 * daily report uses — so both screens agree by construction.
 */
export async function getDayPax(date: string): Promise<ActionData<DayPax>> {
  await requirePermission('kitchen', 'read')
  try {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { success: false, error: 'Bad date' }
    const counts = await getDayMealHeadcounts(date)
    const LABELS: Array<[string, string]> = [
      ['breakfast', 'Breakfast'], ['lunch', 'Lunch'],
      ['afternoon_snack', 'Snack'], ['dinner', 'Dinner'],
    ]
    const meals = LABELS
      .map(([slug, label]) => ({ label, total: counts[slug]?.total ?? 0 }))
      .filter((m) => m.total > 0)
    return {
      success: true,
      data: {
        peak:     Math.max(0, ...meals.map((m) => m.total)),
        bookings: Math.max(0, ...LABELS.map(([slug]) => counts[slug]?.bookings ?? 0)),
        meals,
      },
    }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function setItemVendor(itemId: string, vendorId: string | null): Promise<ActionResult> {
  await requirePermission('kitchen', 'write')
  try {
    const { error } = await dbc().from('inv_items')
      .update({ kitchen_vendor_id: vendorId }).eq('id', itemId)
    if (error) return { success: false, error: error.message }
    revalidatePath('/kitchen/items')
    revalidateTag(KITCHEN_CATALOGUE_TAG)
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
    revalidateTag(KITCHEN_CATALOGUE_TAG)
    revalidatePath('/kitchen/requisitions')
    return { success: true, data: { updated: itemIds.length } }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

// ─── Vendor slots ───────────────────────────────────────────────────────────

/** Derive a stable slug from a display name. */
function slugify(name: string): string {
  return name.toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40) || 'vendor'
}

export async function createKitchenVendor(input: unknown): Promise<ActionData<{ id: string }>> {
  await requirePermission('kitchen', 'write')
  try {
    const parsed = vendorSchema.safeParse(input)
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid vendor' }
    }
    const db = dbc()
    const base = parsed.data.slug ?? slugify(parsed.data.display_name)

    // Retry with a numeric suffix on slug collision rather than failing —
    // "Fish" and "Fish (dry)" both slugify close enough to clash.
    let created: { id: string } | null = null
    for (let attempt = 0; attempt < 6 && !created; attempt++) {
      const slug = attempt === 0 ? base : `${base}_${attempt + 1}`
      const { data, error } = await db.from('kitchen_vendors').insert({
        slug,
        display_name: parsed.data.display_name,
        sort_order:   parsed.data.sort_order,
        is_active:    parsed.data.is_active,
      }).select('id').single()
      if (!error) { created = data; break }
      if (error.code !== '23505') return { success: false, error: error.message }
    }
    if (!created) return { success: false, error: 'Could not create a unique vendor key' }

    revalidatePath('/kitchen/vendors')
    revalidatePath('/kitchen/items')
    revalidateTag(KITCHEN_CATALOGUE_TAG)
    return { success: true, data: created }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/** Rename / reorder / reactivate. The slug is deliberately not editable. */
export async function updateKitchenVendor(id: string, input: unknown): Promise<ActionResult> {
  await requirePermission('kitchen', 'write')
  try {
    const parsed = vendorSchema.safeParse(input)
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid vendor' }
    }
    const { error } = await dbc().from('kitchen_vendors').update({
      display_name: parsed.data.display_name,
      sort_order:   parsed.data.sort_order,
      is_active:    parsed.data.is_active,
    }).eq('id', id)
    if (error) return { success: false, error: error.message }
    revalidatePath('/kitchen/vendors')
    revalidatePath('/kitchen/items')
    revalidateTag(KITCHEN_CATALOGUE_TAG)
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * Deactivate rather than delete. Items and past requisition lines point at
 * this row; removing it would blank the vendor on historical orders and lose
 * what was actually sent to whom.
 */
export async function deactivateKitchenVendor(id: string): Promise<ActionData<{ items: number }>> {
  await requirePermission('kitchen', 'write')
  try {
    const db = dbc()
    const { count } = await db.from('inv_items')
      .select('id', { count: 'exact', head: true }).eq('kitchen_vendor_id', id)
    const { error } = await db.from('kitchen_vendors')
      .update({ is_active: false }).eq('id', id)
    if (error) return { success: false, error: error.message }
    revalidatePath('/kitchen/vendors')
    revalidatePath('/kitchen/items')
    revalidateTag(KITCHEN_CATALOGUE_TAG)
    return { success: true, data: { items: count ?? 0 } }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/** Create an item straight from the kitchen screens, with its vendor set. */
export async function createKitchenItem(raw: unknown): Promise<ActionData<{ id: string }>> {
  await requirePermission('kitchen', 'write')
  try {
    const parsed = kitchenItemCreateSchema.safeParse(raw)
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? 'Could not add the item' }
    }
    const input = parsed.data
    const db = dbc()
    const name = joinItemName(input.name_en, input.name_bn)

    const { data: store } = await db.from('inv_stores').select('id').eq('slug', 'kitchen').maybeSingle()
    if (!store) return { success: false, error: 'No kitchen store configured' }

    // Match on the English half too: "Pumpkin" and "Pumpkin / মিষ্টি কুমড়া" are
    // the same vegetable, and two rows for it means two lines in one order.
    const { data: dupes } = await db.from('inv_items')
      .select('id, name').eq('store_id', store.id)
      .or(`name.ilike.${name},name.ilike.${input.name_en},name.ilike.${input.name_en} /%`)
      .limit(1)
    if (dupes?.length) {
      return { success: false, error: `"${dupes[0].name}" already exists in the kitchen store.` }
    }

    let created: { id: string } | null = null
    for (let attempt = 0; attempt < 6 && !created; attempt++) {
      const { data: maxRow } = await db.from('inv_items')
        .select('sku_code').like('sku_code', 'KIT-%')
        .order('sku_code', { ascending: false }).limit(1).maybeSingle()
      const next = (parseInt(String(maxRow?.sku_code ?? 'KIT-0000').replace('KIT-', ''), 10) || 0) + 1 + attempt
      const { data, error } = await db.from('inv_items').insert({
        sku_code:           `KIT-${String(next).padStart(4, '0')}`,
        store_id:           store.id,
        category_id:        input.category_id,
        name,
        unit_id:            input.unit_id,
        default_unit_price: input.default_unit_price,
        kitchen_vendor_id:  input.kitchen_vendor_id,
        item_type:          'consumable',
        is_active:          true,
      }).select('id').single()
      if (!error) { created = data; break }
      if (error.code !== '23505') return { success: false, error: error.message }
    }
    if (!created) return { success: false, error: 'Could not allocate an item code' }

    revalidatePath('/kitchen/items')

    revalidateTag(KITCHEN_CATALOGUE_TAG)
    return { success: true, data: created }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * Edit an item's name, unit and standing rate after the fact.
 *
 * Deliberately does NOT touch kitchen_vendor_id — the tagging screen changes
 * that with a single dropdown and no save step, and folding it in here would
 * make an unrelated edit able to silently retag an item.
 */
export async function updateKitchenItem(itemId: string, raw: unknown): Promise<ActionResult> {
  await requirePermission('kitchen', 'write')
  try {
    const parsed = kitchenItemUpdateSchema.safeParse(raw)
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? 'Could not save the item' }
    }
    const input = parsed.data
    const { error } = await dbc().from('inv_items').update({
      name:               joinItemName(input.name_en, input.name_bn),
      unit_id:            input.unit_id,
      default_unit_price: input.default_unit_price,
    }).eq('id', itemId)
    if (error) return { success: false, error: error.message }

    revalidatePath('/kitchen/items')

    revalidateTag(KITCHEN_CATALOGUE_TAG)
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

// ─── Dispatch log ───────────────────────────────────────────────────────────

/**
 * Record that a vendor's message was copied.
 *
 * Fired by the copy button. Non-blocking by design — a failure here must never
 * stop somebody sending an order — but the record is what lets everything
 * downstream tell an edit from an amendment, and what answers "did anyone
 * actually send the vegetable order?"
 *
 * Upsert rather than insert: re-copying a message is normal (the paste went
 * to the wrong chat), and it should refresh the timestamp, not stack rows.
 */
export async function recordDispatch(
  requisitionId: string, vendorId: string, message: string,
): Promise<ActionResult> {
  await requirePermission('kitchen', 'write')
  try {
    const ctx = await getCurrentUserContext()
    const { error } = await dbc().from('kitchen_requisition_dispatches').upsert({
      requisition_id:    requisitionId,
      kitchen_vendor_id: vendorId,
      sent_at:           new Date().toISOString(),
      sent_by_user_id:   ctx?.user_id ?? null,
      message_snapshot:  message.slice(0, 4000),
    }, { onConflict: 'requisition_id,kitchen_vendor_id' })
    if (error) return { success: false, error: error.message }
    revalidatePath(`/kitchen/requisitions/${requisitionId}/dispatch`)
    revalidatePath(`/kitchen/requisitions/${requisitionId}`)
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

// ─── Amendments ─────────────────────────────────────────────────────────────

/**
 * Take a requisition back so it can be edited. Two cases, one button.
 *
 *   AWAITING APPROVAL → draft. Nothing has been authorised and, by definition,
 *   nothing has been sent — dispatch requires approval. Editing here is
 *   completely safe, and previously impossible: the sheet locked the moment it
 *   was submitted, so a forgotten item meant cancelling and starting again.
 *
 *   APPROVED (nothing dispatched) → back to awaiting approval, not to draft.
 *   The work of writing it is done, only the authorisation is void; dropping
 *   it to draft would make the approver's queue lose it entirely.
 *
 * Refuses once ANY vendor has been dispatched. At that point a supplier is
 * holding the order and a silent edit is how 5kg becomes 8kg with nobody able
 * to say who decided that — that case is an amendment.
 */
export async function reopenRequisition(id: string): Promise<ActionResult> {
  await requirePermission('kitchen', 'write')
  try {
    const db = dbc()
    const { data: req } = await db.from('kitchen_requisitions')
      .select('status, requisition_no').eq('id', id).maybeSingle()
    if (!req) return { success: false, error: 'Requisition not found' }
    if (req.status !== 'approved' && req.status !== 'pending_approval') {
      return {
        success: false,
        error: req.status === 'draft'
          ? 'This is already a draft — just edit it.'
          : 'This requisition is cancelled.',
      }
    }

    // Only reachable when approved: dispatch is gated on approval. Checked
    // anyway, because "only reachable" is a claim about today's code.
    const { count } = await db.from('kitchen_requisition_dispatches')
      .select('id', { count: 'exact', head: true }).eq('requisition_id', id)
    if ((count ?? 0) > 0) {
      return {
        success: false,
        error: 'This order has already gone to suppliers — raise an amendment instead of editing it.',
      }
    }

    const nextStatus = req.status === 'approved' ? 'pending_approval' : 'draft'
    const ctx = await getCurrentUserContext()
    const { error } = await db.from('kitchen_requisitions').update({
      status: nextStatus,
      // Harmless on the pending_approval path — they are already null — and it
      // keeps one write covering both cases.
      approved_by_employee_id: null, approved_by_user_id: null,
      approved_at: null, approval_notes: null,
      updated_at: new Date().toISOString(),
    }).eq('id', id)
    if (error) return { success: false, error: error.message }

    await logHistory(id, 'edited', nextStatus === 'draft' ? 'pulled_back' : 'reopened', {
      requisition_no: req.requisition_no, from: req.status, to: nextStatus,
      by_user: ctx?.email ?? null,
    })
    revalidatePath('/kitchen/requisitions')
    revalidatePath(`/kitchen/requisitions/${id}`)
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * Start an amendment to a dispatched requisition.
 *
 * Creates an empty child, numbered off the parent (RQ-0008-A), and returns its
 * id so the caller can open the form on it. Lines are entered as CHANGES —
 * "+3 kg potato", "−2 kg beef" — never as a restated order, because the
 * supplier already has the original and a re-sent full list gets delivered
 * twice.
 */
export async function createAmendment(parentId: string): Promise<ActionData<{ id: string }>> {
  await requirePermission('kitchen', 'write')
  try {
    const db  = dbc()
    const { data: parent } = await db.from('kitchen_requisitions')
      .select('id, requisition_no, event_date, status, parent_requisition_id')
      .eq('id', parentId).maybeSingle()
    if (!parent) return { success: false, error: 'Requisition not found' }
    if (parent.parent_requisition_id) {
      return { success: false, error: 'This is already an amendment — amend the original instead.' }
    }
    if (parent.status !== 'approved') {
      return { success: false, error: 'Only an approved requisition can be amended.' }
    }

    const ctx = await getCurrentUserContext()
    let created: { id: string } | null = null
    for (let attempt = 0; attempt < 6 && !created; attempt++) {
      // Re-read the count each attempt: two people amending the same order at
      // once is exactly the situation a fixed sequence would collide on.
      const { count } = await db.from('kitchen_requisitions')
        .select('id', { count: 'exact', head: true }).eq('parent_requisition_id', parentId)
      const seq = (count ?? 0) + 1 + attempt
      const { data, error } = await db.from('kitchen_requisitions').insert({
        requisition_no:        formatAmendmentNo(parent.requisition_no, seq),
        amendment_seq:         seq,
        parent_requisition_id: parentId,
        event_date:            parent.event_date,
        status:                'draft',
        is_emergency:          false,
        created_by:            ctx?.user_id ?? null,
      }).select('id').single()
      if (!error) { created = data; break }
      if (error.code !== '23505') return { success: false, error: error.message }
    }
    if (!created) return { success: false, error: 'Could not allocate an amendment number' }

    await logHistory(created.id, 'created', 'amendment_started', {
      parent: parent.requisition_no,
    })
    revalidatePath(`/kitchen/requisitions/${parentId}`)
    return { success: true, data: created }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}
