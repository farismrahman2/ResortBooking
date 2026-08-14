'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission, getCurrentUserContext } from '@/lib/auth/permissions'
import {
  deliveryDraftSchema, deliveryConfirmSchema, paymentSchema,
} from '@/lib/validators/kitchen'
import { formatDeliveryNo, formatPaymentNo } from '@/lib/kitchen/requisition-number'
import { getDeliveryById } from '@/lib/queries/kitchen-ledger'
import type { ActionResult, ActionData } from './types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const dbc = () => createClient() as any

/** Non-fatal history logging — never blocks the write. */
async function logHistory(
  entityType: 'kitchen_delivery' | 'kitchen_payment',
  id: string,
  event: 'created' | 'edited',
  action: string,
  payload: Record<string, unknown> = {},
) {
  try {
    const { error } = await dbc().from('history_log').insert({
      entity_type: entityType, entity_id: id, event,
      actor: 'system', payload: { action, ...payload },
    })
    if (error) console.warn(`[history_log] non-fatal: ${error.message}`)
  } catch (err) {
    console.warn('[history_log] non-fatal:', err)
  }
}

const money = (n: number) => Math.round(n * 100) / 100

// ═══ Deliveries ═════════════════════════════════════════════════════════════

/**
 * Has anything worth persisting been entered? Same rule as the requisition
 * form: opening a delivery screen and backing out must not leave a row behind.
 */
function hasDeliveryContent(input: {
  kitchen_vendor_id?: unknown; lines?: unknown; supplier_memo_no?: unknown
}): boolean {
  if (typeof input.kitchen_vendor_id === 'string' && input.kitchen_vendor_id) return true
  if (typeof input.supplier_memo_no === 'string' && input.supplier_memo_no.trim()) return true
  return Array.isArray(input.lines) && input.lines.length > 0
}

async function nextDeliveryNo(db: ReturnType<typeof dbc>, attempt: number): Promise<string> {
  const { count } = await db.from('kitchen_deliveries').select('id', { count: 'exact', head: true })
  return formatDeliveryNo((count ?? 0) + attempt)
}

/**
 * Create-or-update a delivery. Id minted client-side, row created lazily.
 *
 * Line totals are computed HERE and never taken from the client: the amount
 * owed to a supplier is not something a browser gets to assert. `total_amount`
 * on the header is denormalised from the same pass, because the ledger reads
 * it per row and must not re-aggregate lines to draw a list.
 */
export async function saveDelivery(id: string, partial: unknown): Promise<ActionResult> {
  await requirePermission('kitchen', 'write')
  try {
    const db = dbc()
    const parsed = deliveryDraftSchema.safeParse(partial ?? {})
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? 'Could not save' }
    }
    const input = parsed.data
    const { lines, ...header } = input

    const { data: existing } = await db.from('kitchen_deliveries')
      .select('status, delivery_no').eq('id', id).maybeSingle()

    if (!existing) {
      if (!hasDeliveryContent(input)) return { success: true }
      if (!header.kitchen_vendor_id) {
        return { success: false, error: 'Pick which supplier this delivery is from' }
      }
      const ctx = await getCurrentUserContext()
      let created = false
      for (let attempt = 0; attempt < 6 && !created; attempt++) {
        const { error } = await db.from('kitchen_deliveries').insert({
          id,
          delivery_no:       await nextDeliveryNo(db, attempt),
          requisition_id:    header.requisition_id ?? null,
          kitchen_vendor_id: header.kitchen_vendor_id,
          supplier_id:       header.supplier_id ?? null,
          delivery_date:     header.delivery_date ?? new Date().toISOString().slice(0, 10),
          status:            'draft',
          created_by:        ctx?.user_id ?? null,
        })
        if (!error) { created = true; break }
        if (error.code !== '23505') return { success: false, error: error.message }
      }
      if (!created) return { success: false, error: 'Could not allocate a delivery number' }
    } else if (existing.status !== 'draft') {
      return {
        success: false,
        error: existing.status === 'cancelled'
          ? 'This delivery is cancelled.'
          : 'This delivery is confirmed — the supplier has been billed. Cancel it to make changes.',
      }
    }

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    // Same not-null trap as the requisition: an empty date input arrives as
    // null, and a `!== undefined` guard would write that over the default.
    if (header.delivery_date)                    patch.delivery_date = header.delivery_date
    if (header.kitchen_vendor_id)                patch.kitchen_vendor_id = header.kitchen_vendor_id
    if (header.requisition_id !== undefined)     patch.requisition_id = header.requisition_id
    if (header.supplier_id !== undefined)        patch.supplier_id = header.supplier_id
    if (header.supplier_memo_no !== undefined)   patch.supplier_memo_no = header.supplier_memo_no
    if (header.received_by_employee_id !== undefined) {
      patch.received_by_employee_id = header.received_by_employee_id
    }
    if (header.notes !== undefined)              patch.notes = header.notes

    if (lines) {
      const rows = lines
        .filter((l) => l.item_name?.trim())
        .map((l, i) => {
          const billable = Number(l.qty_delivered) || 0
          return {
            delivery_id: id, sort_order: i,
            requisition_line_id: l.requisition_line_id ?? null,
            item_id: l.item_id ?? null, item_name: l.item_name.trim(),
            qty_ordered: l.qty_ordered ?? null,
            qty_delivered: billable,
            rejected_qty: l.rejected_qty ?? null,
            reject_reason: l.reject_reason ?? null,
            piece_count: l.piece_count ?? null,
            unit_id: l.unit_id ?? null,
            unit_price: Number(l.unit_price) || 0,
            line_total: money(billable * (Number(l.unit_price) || 0)),
            is_unrequested: l.is_unrequested ?? false,
            notes: l.notes ?? null,
          }
        })
      patch.total_amount = money(rows.reduce((n, r) => n + r.line_total, 0))

      await db.from('kitchen_delivery_lines').delete().eq('delivery_id', id)
      if (rows.length) {
        const { error } = await db.from('kitchen_delivery_lines').insert(rows)
        if (error) return { success: false, error: error.message }
      }
    }

    const { error: upErr } = await db.from('kitchen_deliveries').update(patch).eq('id', id)
    if (upErr) return { success: false, error: upErr.message }

    revalidatePath('/kitchen/deliveries')
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * Draft → confirmed. The moment the delivery becomes money owed.
 *
 * This is where the real validation lives, because it is the last point at
 * which a mistake is free. A zero rate that slips through here becomes a bill
 * of zero that reconciles against nothing and surfaces weeks later as a phone
 * call from the supplier.
 */
export async function confirmDelivery(id: string): Promise<ActionResult> {
  await requirePermission('kitchen', 'write')
  try {
    const db  = dbc()
    const del = await getDeliveryById(id)
    if (!del) return { success: false, error: 'Delivery not found' }
    if (del.status !== 'draft') {
      return { success: false, error: `Already ${del.status}.` }
    }

    const parsed = deliveryConfirmSchema.safeParse({
      kitchen_vendor_id: del.kitchen_vendor_id,
      delivery_date:     del.delivery_date,
      lines:             del.lines,
    })
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? 'Incomplete delivery' }
    }

    const { error } = await db.from('kitchen_deliveries')
      .update({ status: 'confirmed', updated_at: new Date().toISOString() }).eq('id', id)
    if (error) return { success: false, error: error.message }

    await logHistory('kitchen_delivery', id, 'edited', 'confirmed', {
      delivery_no: del.delivery_no, total: del.total_amount, lines: del.lines.length,
    })
    revalidatePath('/kitchen/deliveries')
    revalidatePath(`/kitchen/deliveries/${id}`)
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * Cancel a delivery.
 *
 * Refuses if a payment has been allocated against it: unwinding the money
 * silently would leave a cheque settling a bill that no longer exists, and the
 * vendor balance would quietly stop adding up. Remove the allocation first.
 */
export async function cancelDelivery(id: string, reason: string): Promise<ActionResult> {
  await requirePermission('kitchen', 'write')
  try {
    const db = dbc()
    if (!reason?.trim()) return { success: false, error: 'Give a reason' }

    const { data: allocs } = await db.from('kitchen_payment_allocations')
      .select('id, payment:kitchen_vendor_payments(payment_no, status)')
      .eq('delivery_id', id)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const live = ((allocs ?? []) as any[]).filter((a) => a.payment?.status !== 'cancelled')
    if (live.length > 0) {
      return {
        success: false,
        error: `Payment ${live[0].payment?.payment_no ?? ''} is settled against this delivery. Remove that allocation first.`,
      }
    }

    const { data: del } = await db.from('kitchen_deliveries')
      .select('delivery_no').eq('id', id).maybeSingle()
    const { error } = await db.from('kitchen_deliveries').update({
      status: 'cancelled', cancel_reason: reason.trim(),
      updated_at: new Date().toISOString(),
    }).eq('id', id)
    if (error) return { success: false, error: error.message }

    await logHistory('kitchen_delivery', id, 'edited', 'cancelled', {
      delivery_no: del?.delivery_no, reason: reason.trim(),
    })
    revalidatePath('/kitchen/deliveries')
    revalidatePath(`/kitchen/deliveries/${id}`)
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/** Discard an untouched draft — the delivery equivalent of closing the form. */
export async function discardDelivery(id: string): Promise<ActionResult> {
  await requirePermission('kitchen', 'write')
  try {
    const db = dbc()
    const { data: del } = await db.from('kitchen_deliveries')
      .select('status').eq('id', id).maybeSingle()
    if (!del) return { success: true }
    if (del.status !== 'draft') return { success: false, error: 'Only a draft can be discarded.' }
    const { error } = await db.from('kitchen_deliveries').delete().eq('id', id)
    if (error) return { success: false, error: error.message }
    revalidatePath('/kitchen/deliveries')
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

// ═══ Payments ═══════════════════════════════════════════════════════════════

async function nextPaymentNo(db: ReturnType<typeof dbc>, attempt: number): Promise<string> {
  const { count } = await db.from('kitchen_vendor_payments').select('id', { count: 'exact', head: true })
  return formatPaymentNo((count ?? 0) + attempt)
}

/**
 * Record a payment and what it settles.
 *
 * Written in one go rather than saved as a draft: a cheque is written once and
 * the details are in front of whoever is typing. Allocations are replaced
 * wholesale, so editing a payment cannot leave an orphan settling a bill twice.
 *
 * Deliberately creates NO expense row. The cost was incurred when the goods
 * arrived; a payment moves money against a liability that already exists.
 * Posting here as well would count the same food twice.
 */
export async function recordPayment(
  input: unknown, paymentId?: string,
): Promise<ActionData<{ id: string }>> {
  await requirePermission('kitchen', 'write')
  try {
    const db = dbc()
    const parsed = paymentSchema.safeParse(input)
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? 'Could not record the payment' }
    }
    const p = parsed.data

    // Guard the over-allocation the schema can't see: a delivery already
    // settled by an earlier cheque must not be settled again by this one.
    if (p.allocations.length > 0) {
      const ids = p.allocations.map((a) => a.delivery_id)
      const { data: dels } = await db.from('kitchen_deliveries')
        .select('id, delivery_no, total_amount, status, allocations:kitchen_payment_allocations(payment_id, amount_allocated, payment:kitchen_vendor_payments(status))')
        .in('id', ids)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const d of ((dels ?? []) as any[])) {
        if (d.status !== 'confirmed') {
          return { success: false, error: `${d.delivery_no} isn't confirmed yet — nothing is owed on it.` }
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const otherPaid = ((d.allocations ?? []) as any[])
          .filter((a) => a.payment_id !== paymentId && a.payment?.status !== 'cancelled')
          .reduce((n, a) => n + Number(a.amount_allocated ?? 0), 0)
        const here = p.allocations.find((a) => a.delivery_id === d.id)?.amount ?? 0
        if (otherPaid + here > Number(d.total_amount) + 0.01) {
          return {
            success: false,
            error: `${d.delivery_no} would be over-paid: ${money(otherPaid + here)} against a bill of ${Number(d.total_amount)}.`,
          }
        }
      }
    }

    const ctx = await getCurrentUserContext()
    const header = {
      kitchen_vendor_id: p.kitchen_vendor_id,
      supplier_id:       p.supplier_id,
      payment_date:      p.payment_date,
      method:            p.method,
      cheque_no:         p.cheque_no,
      cheque_date:       p.cheque_date,
      bank_name:         p.bank_name,
      amount:            p.amount,
      notes:             p.notes,
      updated_at:        new Date().toISOString(),
    }

    let id = paymentId ?? null
    if (id) {
      const { data: cur } = await db.from('kitchen_vendor_payments')
        .select('status').eq('id', id).maybeSingle()
      if (!cur) return { success: false, error: 'Payment not found' }
      if (cur.status === 'cancelled') return { success: false, error: 'This payment is cancelled.' }
      const { error } = await db.from('kitchen_vendor_payments').update(header).eq('id', id)
      if (error) return { success: false, error: error.message }
    } else {
      let created: { id: string } | null = null
      for (let attempt = 0; attempt < 6 && !created; attempt++) {
        const { data, error } = await db.from('kitchen_vendor_payments').insert({
          ...header,
          payment_no: await nextPaymentNo(db, attempt),
          status:     'recorded',
          created_by: ctx?.user_id ?? null,
        }).select('id').single()
        if (!error) { created = data; break }
        if (error.code !== '23505') return { success: false, error: error.message }
      }
      if (!created) return { success: false, error: 'Could not allocate a payment number' }
      id = created.id
    }

    await db.from('kitchen_payment_allocations').delete().eq('payment_id', id)
    if (p.allocations.length > 0) {
      const { error } = await db.from('kitchen_payment_allocations').insert(
        p.allocations.map((a) => ({
          payment_id: id, delivery_id: a.delivery_id, amount_allocated: a.amount,
        })),
      )
      if (error) return { success: false, error: error.message }
    }

    await logHistory('kitchen_payment', id as string, paymentId ? 'edited' : 'created',
      paymentId ? 'payment_updated' : 'payment_recorded',
      { amount: p.amount, method: p.method, cheque_no: p.cheque_no, settles: p.allocations.length })

    revalidatePath('/kitchen/payments')
    revalidatePath('/kitchen/ledger')
    revalidatePath('/kitchen/deliveries')
    return { success: true, data: { id: id as string } }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * Cancel a payment — a bounced or voided cheque.
 *
 * The row stays, with its reason. Deleting it would erase the fact that a
 * cheque was written at all, which is exactly what someone will need to look
 * up when the bank statement doesn't match. Its allocations stop counting
 * because every balance query filters on payment status.
 */
export async function cancelPayment(id: string, reason: string): Promise<ActionResult> {
  await requirePermission('kitchen', 'write')
  try {
    if (!reason?.trim()) return { success: false, error: 'Give a reason' }
    const db = dbc()
    const { data: pay } = await db.from('kitchen_vendor_payments')
      .select('payment_no, status').eq('id', id).maybeSingle()
    if (!pay) return { success: false, error: 'Payment not found' }
    if (pay.status === 'cancelled') return { success: false, error: 'Already cancelled.' }

    const { error } = await db.from('kitchen_vendor_payments').update({
      status: 'cancelled', cancel_reason: reason.trim(),
      updated_at: new Date().toISOString(),
    }).eq('id', id)
    if (error) return { success: false, error: error.message }

    await logHistory('kitchen_payment', id, 'edited', 'payment_cancelled', {
      payment_no: pay.payment_no, reason: reason.trim(),
    })
    revalidatePath('/kitchen/payments')
    revalidatePath('/kitchen/ledger')
    revalidatePath('/kitchen/deliveries')
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}
