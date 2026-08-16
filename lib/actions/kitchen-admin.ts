'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission, isAdmin } from '@/lib/auth/permissions'
import { KITCHEN_DOCS_BUCKET } from '@/lib/kitchen/documents'
import type { ActionResult } from './types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const dbc = () => createClient() as any

/**
 * Admin-only PERMANENT deletion, for cleaning test entries out of the
 * pipeline. Everything else in the module cancels rather than deletes —
 * cancellation keeps the paper trail — but test data isn't a paper trail,
 * it's noise, and only an admin gets to decide which is which.
 */
async function requireAdmin(): Promise<string | null> {
  await requirePermission('kitchen', 'write')
  if (!(await isAdmin())) return 'Only an admin can permanently delete records.'
  return null
}

/** Remove attached photos: storage objects first, then the document rows. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function purgeDocuments(db: any, entityType: string, entityIds: string[]) {
  if (entityIds.length === 0) return
  const { data: docs } = await db.from('kitchen_documents')
    .select('id, storage_path')
    .eq('entity_type', entityType)
    .in('entity_id', entityIds)
  const paths = ((docs ?? []) as Array<{ storage_path: string }>).map((d) => d.storage_path)
  if (paths.length > 0) {
    const { error } = await createClient().storage.from(KITCHEN_DOCS_BUCKET).remove(paths)
    if (error) console.warn(`[kitchen-admin] storage cleanup non-fatal: ${error.message}`)
  }
  await db.from('kitchen_documents')
    .delete().eq('entity_type', entityType).in('entity_id', entityIds)
}

async function logDeletion(entityType: string, id: string, label: string) {
  try {
    await dbc().from('history_log').insert({
      entity_type: entityType, entity_id: id, event: 'edited',
      actor: 'system', payload: { action: 'permanently_deleted', label },
    })
  } catch { /* non-fatal */ }
}

/**
 * Delete a requisition and its child amendments outright. Lines and dispatch
 * records cascade in the database. Refuses while deliveries still point at it
 * — delete those first so nothing in the ledger is left orphaned.
 */
export async function deleteRequisitionPermanently(id: string): Promise<ActionResult> {
  const denied = await requireAdmin()
  if (denied) return { success: false, error: denied }
  try {
    const db = dbc()
    const { data: req } = await db.from('kitchen_requisitions')
      .select('id, requisition_no').eq('id', id).maybeSingle()
    if (!req) return { success: false, error: 'Requisition not found' }

    const { data: children } = await db.from('kitchen_requisitions')
      .select('id').eq('parent_requisition_id', id)
    const allIds = [id, ...((children ?? []) as Array<{ id: string }>).map((c) => c.id)]

    const { data: dels } = await db.from('kitchen_deliveries')
      .select('delivery_no').in('requisition_id', allIds).limit(5)
    if (dels?.length) {
      return {
        success: false,
        error: `Delete its deliveries first (${(dels as Array<{ delivery_no: string }>).map((d) => d.delivery_no).join(', ')}) — they still reference this requisition.`,
      }
    }

    await purgeDocuments(db, 'requisition', allIds)
    const { error } = await db.from('kitchen_requisitions').delete().in('id', allIds)
    if (error) return { success: false, error: error.message }

    await logDeletion('kitchen_requisition', id, req.requisition_no)
    revalidatePath('/kitchen/requisitions')
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * Delete a delivery outright. Lines cascade; any payment allocations against
 * it cascade too (the payment itself survives, simply less allocated).
 */
export async function deleteDeliveryPermanently(id: string): Promise<ActionResult> {
  const denied = await requireAdmin()
  if (denied) return { success: false, error: denied }
  try {
    const db = dbc()
    const { data: del } = await db.from('kitchen_deliveries')
      .select('id, delivery_no').eq('id', id).maybeSingle()
    if (!del) return { success: false, error: 'Delivery not found' }

    await purgeDocuments(db, 'delivery', [id])
    const { error } = await db.from('kitchen_deliveries').delete().eq('id', id)
    if (error) return { success: false, error: error.message }

    await logDeletion('kitchen_delivery', id, del.delivery_no)
    revalidatePath('/kitchen/deliveries')
    revalidatePath('/kitchen/ledger')
    revalidatePath('/kitchen/payments')
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * Delete a payment outright, along with its allocations and the expense row
 * it posted to the cash book.
 */
export async function deletePaymentPermanently(id: string): Promise<ActionResult> {
  const denied = await requireAdmin()
  if (denied) return { success: false, error: denied }
  try {
    const db = dbc()
    const { data: pay } = await db.from('kitchen_vendor_payments')
      .select('id, payment_no').eq('id', id).maybeSingle()
    if (!pay) return { success: false, error: 'Payment not found' }

    await purgeDocuments(db, 'payment', [id])
    await db.from('expenses').delete()
      .eq('source_module', 'kitchen').eq('source_id', id)
    const { error } = await db.from('kitchen_vendor_payments').delete().eq('id', id)
    if (error) return { success: false, error: error.message }

    await logDeletion('kitchen_payment', id, pay.payment_no)
    revalidatePath('/kitchen/payments')
    revalidatePath('/kitchen/ledger')
    revalidatePath('/kitchen/deliveries')
    revalidatePath('/expenses')
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}
