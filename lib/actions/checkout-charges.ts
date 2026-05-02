'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { addChargeSchema, updateChargeSchema } from '@/lib/validators/checkout'
import { requirePermission, getCurrentUserContext } from '@/lib/auth/permissions'
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
      entity_type: 'checkout',
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

/**
 * Returns the existing draft checkout for a booking, or creates one if missing.
 * Refuses if the existing checkout is finalized/voided.
 */
export async function getOrCreateDraftCheckout(
  bookingId: string,
): Promise<ActionData<{ id: string; status: 'draft' | 'finalized' | 'voided' }>> {
  try {
    await requirePermission('checkout', 'write')
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any

    const { data: existing } = await db
      .from('checkouts').select('id, status').eq('booking_id', bookingId).maybeSingle()
    if (existing) return { success: true, data: existing as any }

    const { data, error } = await db
      .from('checkouts')
      .insert({ booking_id: bookingId, status: 'draft' })
      .select('id, status')
      .single()
    if (error || !data) return { success: false, error: error?.message ?? 'Insert failed' }
    revalidatePath(`/checkout/${bookingId}`)
    revalidatePath(`/bookings/${bookingId}`)
    return { success: true, data: data as any }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function addCharge(input: unknown): Promise<ActionData<{ id: string }>> {
  try {
    await requirePermission('checkout', 'write')
    const parsed = addChargeSchema.parse(input)
    const ctx = await getCurrentUserContext()
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any

    // Get-or-create the draft checkout
    const { data: existing } = await db
      .from('checkouts').select('id, status').eq('booking_id', parsed.booking_id).maybeSingle()

    let checkoutId: string
    let status:     'draft' | 'finalized' | 'voided'
    if (existing) {
      checkoutId = existing.id
      status     = existing.status
    } else {
      const { data: ins, error: insErr } = await db
        .from('checkouts')
        .insert({ booking_id: parsed.booking_id, status: 'draft' })
        .select('id, status')
        .single()
      if (insErr || !ins) return { success: false, error: insErr?.message ?? 'Could not open checkout' }
      checkoutId = ins.id
      status     = ins.status
    }

    if (status !== 'draft') {
      return { success: false, error: `Cannot add charges — checkout is ${status}.` }
    }

    const { data, error } = await db
      .from('checkout_charges')
      .insert({
        checkout_id:    checkoutId,
        category_id:    parsed.category_id,
        charge_item_id: parsed.charge_item_id ?? null,
        description:    parsed.description,
        quantity:       parsed.quantity,
        unit_price:     parsed.unit_price,
        notes:          parsed.notes || null,
        added_by:       ctx?.user_id ?? null,
      })
      .select('id')
      .single()
    if (error || !data) return { success: false, error: error?.message ?? 'Insert failed' }

    await logHistory(checkoutId, 'edited', 'charge_added', {
      booking_id:  parsed.booking_id,
      description: parsed.description,
      amount:      parsed.quantity * parsed.unit_price,
    })

    revalidatePath(`/bookings/${parsed.booking_id}`)
    revalidatePath(`/checkout/${parsed.booking_id}`)
    revalidatePath('/checkout')
    return { success: true, data: { id: data.id } }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function updateCharge(chargeId: string, input: unknown): Promise<ActionResult> {
  try {
    await requirePermission('checkout', 'write')
    const parsed = updateChargeSchema.parse(input)
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any

    // Refuse if the charge belongs to a finalized checkout
    const { data: charge } = await db
      .from('checkout_charges')
      .select('id, checkout_id, checkout:checkouts!inner (status, booking_id)')
      .eq('id', chargeId)
      .maybeSingle()
    if (!charge) return { success: false, error: 'Charge not found' }
    if (charge.checkout.status !== 'draft') {
      return { success: false, error: `Cannot edit — checkout is ${charge.checkout.status}.` }
    }

    const { error } = await db
      .from('checkout_charges')
      .update({
        description: parsed.description,
        quantity:    parsed.quantity,
        unit_price:  parsed.unit_price,
        notes:       parsed.notes || null,
      })
      .eq('id', chargeId)
    if (error) return { success: false, error: error.message }

    await logHistory(charge.checkout_id, 'edited', 'charge_updated', {
      booking_id: charge.checkout.booking_id,
      charge_id:  chargeId,
    })

    revalidatePath(`/bookings/${charge.checkout.booking_id}`)
    revalidatePath(`/checkout/${charge.checkout.booking_id}`)
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function removeCharge(chargeId: string): Promise<ActionResult> {
  try {
    await requirePermission('checkout', 'write')
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any

    const { data: charge } = await db
      .from('checkout_charges')
      .select('id, checkout_id, checkout:checkouts!inner (status, booking_id)')
      .eq('id', chargeId)
      .maybeSingle()
    if (!charge) return { success: false, error: 'Charge not found' }
    if (charge.checkout.status !== 'draft') {
      return { success: false, error: `Cannot remove — checkout is ${charge.checkout.status}.` }
    }

    const { error } = await db.from('checkout_charges').delete().eq('id', chargeId)
    if (error) return { success: false, error: error.message }

    await logHistory(charge.checkout_id, 'edited', 'charge_removed', {
      booking_id: charge.checkout.booking_id,
      charge_id:  chargeId,
    })

    revalidatePath(`/bookings/${charge.checkout.booking_id}`)
    revalidatePath(`/checkout/${charge.checkout.booking_id}`)
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}
