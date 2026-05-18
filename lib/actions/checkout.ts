'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import {
  addPaymentSchema,
  recordRefundSchema,
  voidCheckoutSchema,
  applyDiscountSchema,
  adjustGuestCountSchema,
} from '@/lib/validators/checkout'
import { requirePermission, getCurrentUserContext, isAdmin } from '@/lib/auth/permissions'
import { flagAlert } from '@/lib/auth/alerts'
import { calcChargesTotal, calcPaymentsTotal } from '@/lib/checkout/totals'
import { formatBDT } from '@/lib/formatters/currency'
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

// ─── Payments ────────────────────────────────────────────────────────────────

export async function addPayment(
  checkoutId: string,
  input: unknown,
): Promise<ActionData<{ id: string }>> {
  try {
    await requirePermission('checkout', 'write')
    const parsed = addPaymentSchema.parse(input)
    const ctx = await getCurrentUserContext()
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any

    const { data: checkout } = await db
      .from('checkouts').select('id, status, booking_id').eq('id', checkoutId).maybeSingle()
    if (!checkout) return { success: false, error: 'Checkout not found' }
    if (checkout.status !== 'draft') {
      return { success: false, error: `Cannot add payment — checkout is ${checkout.status}.` }
    }

    const { data, error } = await db
      .from('checkout_payments')
      .insert({
        checkout_id: checkoutId,
        amount:      parsed.amount,
        method:      parsed.method,
        reference:   parsed.reference || null,
        notes:       parsed.notes || null,
        recorded_by: ctx?.user_id ?? null,
      })
      .select('id')
      .single()
    if (error || !data) return { success: false, error: error?.message ?? 'Insert failed' }

    await logHistory(checkoutId, 'edited', 'payment_added', {
      booking_id: checkout.booking_id,
      amount:     parsed.amount,
      method:     parsed.method,
    })

    revalidatePath(`/checkout/${checkout.booking_id}`)
    return { success: true, data: { id: data.id } }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function removePayment(paymentId: string): Promise<ActionResult> {
  try {
    await requirePermission('checkout', 'write')
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any

    const { data: payment } = await db
      .from('checkout_payments')
      .select('id, checkout_id, checkout:checkouts!inner (status, booking_id)')
      .eq('id', paymentId)
      .maybeSingle()
    if (!payment) return { success: false, error: 'Payment not found' }
    if (payment.checkout.status !== 'draft') {
      return { success: false, error: `Cannot remove — checkout is ${payment.checkout.status}.` }
    }

    const { error } = await db.from('checkout_payments').delete().eq('id', paymentId)
    if (error) return { success: false, error: error.message }

    await logHistory(payment.checkout_id, 'edited', 'payment_removed', {
      booking_id: payment.checkout.booking_id,
      payment_id: paymentId,
    })

    revalidatePath(`/checkout/${payment.checkout.booking_id}`)
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

// ─── Finalize ────────────────────────────────────────────────────────────────

export async function finalizeCheckout(
  checkoutId: string,
): Promise<ActionData<{ booking_id: string; net_due: number }>> {
  try {
    await requirePermission('checkout', 'write')
    const ctx = await getCurrentUserContext()
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any

    const { data: checkout } = await db
      .from('checkouts')
      .select('id, status, booking_id, discount_amount')
      .eq('id', checkoutId)
      .maybeSingle()
    if (!checkout) return { success: false, error: 'Checkout not found' }
    if (checkout.status !== 'draft') {
      return { success: false, error: `Cannot finalize — checkout is ${checkout.status}.` }
    }

    const { data: booking } = await db
      .from('bookings')
      .select('id, status, advance_paid, total')
      .eq('id', checkout.booking_id)
      .single()
    if (!booking) return { success: false, error: 'Booking not found' }

    const { data: charges } = await db
      .from('checkout_charges').select('amount, quantity, unit_price').eq('checkout_id', checkoutId)
    const { data: payments } = await db
      .from('checkout_payments').select('amount').eq('checkout_id', checkoutId)

    const bookingTotal   = Number(booking.total ?? 0)
    const advance        = Number(booking.advance_paid ?? 0)
    const chargesTotal   = calcChargesTotal((charges ?? []) as any[])
    const paymentsTotal  = calcPaymentsTotal((payments ?? []) as any[])
    const discountAmount = Number(checkout.discount_amount ?? 0)
    // Net due includes the discount: (bookingTotal + chargesTotal − discount) − (advance + payments)
    const netDue = Math.round(
      (bookingTotal + chargesTotal - discountAmount - advance - paymentsTotal) * 100,
    ) / 100

    // Hard guard: don't finalize while the guest still owes money. Refund-due
    // (netDue < 0) is allowed through — the operator records the payout via
    // the existing Refund Payout flow after finalize.
    if (netDue > 0.01) {
      return {
        success: false,
        error: `Cannot finalize — guest still owes ৳${netDue.toLocaleString('en-IN')}. Record a payment to settle the balance first.`,
      }
    }

    const { error: updErr } = await db
      .from('checkouts')
      .update({
        advance_amount: advance,
        charges_total:  chargesTotal,
        payments_total: paymentsTotal,
        status:         'finalized',
        finalized_at:   new Date().toISOString(),
        finalized_by:   ctx?.user_id ?? null,
      })
      .eq('id', checkoutId)
    if (updErr) return { success: false, error: updErr.message }

    // Flip booking status to checked_out
    const { error: bookErr } = await db
      .from('bookings')
      .update({ status: 'checked_out' })
      .eq('id', booking.id)
    if (bookErr) {
      console.warn(`[finalize] booking status update failed: ${bookErr.message}`)
    }

    await logHistory(checkoutId, 'edited', 'checkout_finalized', {
      booking_id:    booking.id,
      charges_total: chargesTotal,
      payments_total: paymentsTotal,
      net_due:       netDue,
    })

    revalidatePath(`/checkout/${booking.id}`)
    revalidatePath('/checkout')
    revalidatePath('/bookings')
    return { success: true, data: { booking_id: booking.id, net_due: netDue } }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

// ─── Void (admin only) ───────────────────────────────────────────────────────

export async function voidCheckout(
  checkoutId: string,
  input: unknown,
): Promise<ActionResult> {
  try {
    // Defense in depth: settings write + admin role check
    await requirePermission('settings', 'write')
    if (!(await isAdmin())) {
      return { success: false, error: 'Only an admin can void a checkout.' }
    }

    const parsed = voidCheckoutSchema.parse(input)
    const ctx = await getCurrentUserContext()
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any

    const { data: checkout } = await db
      .from('checkouts')
      .select('id, status, booking_id, refund_expense_id')
      .eq('id', checkoutId)
      .maybeSingle()
    if (!checkout) return { success: false, error: 'Checkout not found' }
    if (checkout.status !== 'finalized') {
      return { success: false, error: `Cannot void — checkout is ${checkout.status}.` }
    }

    const { error: updErr } = await db
      .from('checkouts')
      .update({
        status:      'voided',
        voided_at:   new Date().toISOString(),
        voided_by:   ctx?.user_id ?? null,
        void_reason: parsed.reason,
      })
      .eq('id', checkoutId)
    if (updErr) return { success: false, error: updErr.message }

    // Revert the booking status. Default to 'confirmed' since we don't track
    // checked_in separately in v1.
    const { error: bookErr } = await db
      .from('bookings')
      .update({ status: 'confirmed' })
      .eq('id', checkout.booking_id)
    if (bookErr) console.warn(`[void] booking status revert failed: ${bookErr.message}`)

    await logHistory(checkoutId, 'edited', 'checkout_voided', {
      booking_id:        checkout.booking_id,
      reason:            parsed.reason,
      refund_expense_id: checkout.refund_expense_id,
    })

    await flagAlert({
      event_type:  'checkout_voided',
      entity_type: 'checkout',
      entity_id:   checkoutId,
      summary:     `Checkout voided — ${parsed.reason}`,
      payload:     { booking_id: checkout.booking_id, reason: parsed.reason, refund_expense_id: checkout.refund_expense_id },
      created_by:  ctx?.user_id ?? null,
    })

    revalidatePath(`/checkout/${checkout.booking_id}`)
    revalidatePath('/checkout')
    revalidatePath('/settings/audit-log')
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

// ─── Reopen a finalized checkout (admin only) ────────────────────────────────

/**
 * Flip a finalized checkout back to draft so an admin can edit charges,
 * payments, discount, or guest count and re-finalize. Reverts the booking
 * status from `checked_out` back to `confirmed` so the operational state
 * matches the bill state.
 *
 * Refund payouts and audit alerts that reference this checkout are NOT
 * rolled back — surface them in the next finalize for the admin to decide.
 */
export async function reopenCheckout(checkoutId: string): Promise<ActionResult> {
  try {
    await requirePermission('checkout', 'write')
    if (!(await isAdmin())) {
      return { success: false, error: 'Only an admin can reopen a finalized checkout.' }
    }
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any
    const { data: checkout } = await db
      .from('checkouts')
      .select('id, status, booking_id')
      .eq('id', checkoutId)
      .maybeSingle()
    if (!checkout) return { success: false, error: 'Checkout not found' }
    if (checkout.status !== 'finalized') {
      return { success: false, error: `Cannot reopen — checkout is ${checkout.status}.` }
    }

    const { error: updErr } = await db
      .from('checkouts')
      .update({ status: 'draft', finalized_at: null, finalized_by: null })
      .eq('id', checkoutId)
    if (updErr) return { success: false, error: updErr.message }

    // Revert the booking back to confirmed so it doesn't read as checked_out
    // while the bill is being amended.
    const { error: bookErr } = await db
      .from('bookings')
      .update({ status: 'confirmed' })
      .eq('id', checkout.booking_id)
    if (bookErr) console.warn(`[reopen] booking status revert failed: ${bookErr.message}`)

    await logHistory(checkoutId, 'edited', 'checkout_reopened', {
      booking_id: checkout.booking_id,
    })

    revalidatePath(`/checkout/${checkout.booking_id}`)
    revalidatePath('/checkout')
    revalidatePath('/settings/audit-log')
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

// ─── Refund (auto-write expense) ─────────────────────────────────────────────

export async function recordRefund(
  checkoutId: string,
  input: unknown,
): Promise<ActionData<{ expense_id: string }>> {
  try {
    await requirePermission('checkout', 'write')
    const parsed = recordRefundSchema.parse(input)
    const ctx = await getCurrentUserContext()
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any

    const { data: checkout } = await db
      .from('checkouts')
      .select(`
        id, status, booking_id, advance_amount, charges_total, payments_total, net_due,
        booking:bookings!inner (id, booking_number, customer_name)
      `)
      .eq('id', checkoutId)
      .maybeSingle()
    if (!checkout) return { success: false, error: 'Checkout not found' }
    if (checkout.status !== 'finalized') {
      return { success: false, error: 'Refunds can only be recorded on finalized checkouts.' }
    }

    // Resolve refund expense category — prefer slug 'guest_refund', else
    // any active category in the 'miscellaneous' group, else create one.
    let { data: cat } = await db
      .from('expense_categories').select('id').eq('slug', 'guest_refund').maybeSingle()
    if (!cat) {
      const { data: misc } = await db
        .from('expense_categories')
        .select('id')
        .eq('category_group', 'miscellaneous')
        .eq('is_active', true)
        .order('display_order', { ascending: true })
        .limit(1)
        .maybeSingle()
      cat = misc
    }
    if (!cat) {
      // Create one as a fallback
      const { data: created } = await db
        .from('expense_categories')
        .insert({
          name: 'Guest Refund',
          slug: 'guest_refund',
          category_group: 'miscellaneous',
          requires_description: true,
          is_active: true,
          display_order: 999,
        })
        .select('id').single()
      cat = created
    }
    if (!cat?.id) return { success: false, error: 'Could not resolve a refund expense category.' }

    // Map checkout payment_method → expense payment_method (overlap is exact except 'card')
    const expenseMethod = parsed.method === 'card' ? 'other' : parsed.method

    const today = new Date().toISOString().slice(0, 10)
    const description = `Refund: ${checkout.booking.customer_name} (${checkout.booking.booking_number})`

    const { data: exp, error: expErr } = await db
      .from('expenses')
      .insert({
        expense_date:     today,
        category_id:      cat.id,
        description,
        amount:           parsed.amount,
        payment_method:   expenseMethod,
        reference_number: parsed.reference || null,
        is_draft:         false,
        created_by:       ctx?.user_id ?? null,
      })
      .select('id')
      .single()
    if (expErr || !exp) return { success: false, error: expErr?.message ?? 'Could not create expense' }

    const { error } = await db
      .from('checkouts')
      .update({ refund_amount: parsed.amount, refund_expense_id: exp.id })
      .eq('id', checkoutId)
    if (error) return { success: false, error: error.message }

    await logHistory(checkoutId, 'edited', 'refund_recorded', {
      booking_id: checkout.booking_id,
      amount:     parsed.amount,
      method:     parsed.method,
      expense_id: exp.id,
    })

    await flagAlert({
      event_type:  'refund_recorded',
      entity_type: 'checkout',
      entity_id:   checkoutId,
      summary:     `Refund of ${formatBDT(parsed.amount)} via ${parsed.method} — ${checkout.booking.customer_name} (${checkout.booking.booking_number})`,
      payload:     { booking_id: checkout.booking_id, amount: parsed.amount, method: parsed.method, expense_id: exp.id },
      created_by:  ctx?.user_id ?? null,
    })

    revalidatePath(`/checkout/${checkout.booking_id}`)
    revalidatePath('/expenses')
    revalidatePath('/')
    revalidatePath('/settings/audit-log')
    return { success: true, data: { expense_id: exp.id } }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

// ─── Discount ────────────────────────────────────────────────────────────────

export async function applyDiscount(
  checkoutId: string,
  input: unknown,
): Promise<ActionData<{ amount: number }>> {
  try {
    await requirePermission('checkout', 'write')
    const parsed = applyDiscountSchema.parse(input)
    const ctx = await getCurrentUserContext()
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any

    const { data: checkout } = await db
      .from('checkouts')
      .select(`
        id, status, booking_id, charges_total,
        booking:bookings!inner (id, total, customer_name, booking_number)
      `)
      .eq('id', checkoutId)
      .maybeSingle()
    if (!checkout) return { success: false, error: 'Checkout not found' }
    if (checkout.status !== 'draft') {
      return { success: false, error: `Cannot edit discount — checkout is ${checkout.status}.` }
    }

    // Convert percent → fixed amount based on (booking total + extra charges)
    const subtotal = Number(checkout.booking.total ?? 0) + Number(checkout.charges_total ?? 0)
    const fixed = parsed.mode === 'percent'
      ? Math.round((subtotal * parsed.value) / 100 * 100) / 100
      : parsed.value
    const pct   = parsed.mode === 'percent' ? parsed.value : 0

    if (fixed > subtotal) {
      return { success: false, error: `Discount (${formatBDT(fixed)}) cannot exceed the bill (${formatBDT(subtotal)}).` }
    }

    const { error } = await db
      .from('checkouts')
      .update({
        discount_amount:     fixed,
        discount_pct:        pct,
        discount_reason:     parsed.reason,
        discount_applied_by: ctx?.user_id ?? null,
        discount_applied_at: new Date().toISOString(),
      })
      .eq('id', checkoutId)
    if (error) return { success: false, error: error.message }

    await logHistory(checkoutId, 'edited', 'discount_applied', {
      booking_id: checkout.booking_id,
      mode:       parsed.mode,
      value:      parsed.value,
      amount:     fixed,
      reason:     parsed.reason,
    })

    await flagAlert({
      event_type:  'discount_applied',
      entity_type: 'checkout',
      entity_id:   checkoutId,
      summary:     `Discount ${parsed.mode === 'percent' ? parsed.value + '%' : formatBDT(fixed)} applied — ${checkout.booking.customer_name} (${checkout.booking.booking_number}). Reason: ${parsed.reason}`,
      payload:     { booking_id: checkout.booking_id, mode: parsed.mode, value: parsed.value, amount: fixed, reason: parsed.reason },
      created_by:  ctx?.user_id ?? null,
    })

    revalidatePath(`/checkout/${checkout.booking_id}`)
    revalidatePath('/settings/audit-log')
    return { success: true, data: { amount: fixed } }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function clearDiscount(checkoutId: string): Promise<ActionResult> {
  try {
    await requirePermission('checkout', 'write')
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any

    const { data: checkout } = await db
      .from('checkouts').select('id, status, booking_id, discount_amount').eq('id', checkoutId).maybeSingle()
    if (!checkout) return { success: false, error: 'Checkout not found' }
    if (checkout.status !== 'draft') {
      return { success: false, error: 'Cannot clear discount on a finalized/voided checkout.' }
    }
    if (!checkout.discount_amount || Number(checkout.discount_amount) === 0) {
      return { success: true }
    }

    const { error } = await db
      .from('checkouts')
      .update({
        discount_amount: 0,
        discount_pct:    0,
        discount_reason: null,
        discount_applied_by: null,
        discount_applied_at: null,
      })
      .eq('id', checkoutId)
    if (error) return { success: false, error: error.message }

    await logHistory(checkoutId, 'edited', 'discount_cleared', { booking_id: checkout.booking_id })
    revalidatePath(`/checkout/${checkout.booking_id}`)
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

// ─── Audit log support ───────────────────────────────────────────────────────

export async function acknowledgeAlert(alertId: string): Promise<ActionResult> {
  try {
    await requirePermission('settings', 'read')
    const ctx = await getCurrentUserContext()
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any
    const { error } = await db
      .from('admin_alerts')
      .update({ acknowledged_at: new Date().toISOString(), acknowledged_by: ctx?.user_id ?? null })
      .eq('id', alertId)
    if (error) return { success: false, error: error.message }
    revalidatePath('/settings/audit-log')
    revalidatePath('/settings')
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

// ─── Actual guest count (audit-only) ─────────────────────────────────────────

export async function adjustActualGuestCount(
  checkoutId: string,
  input: unknown,
): Promise<ActionResult> {
  try {
    await requirePermission('checkout', 'write')
    const parsed = adjustGuestCountSchema.parse(input)
    const ctx = await getCurrentUserContext()
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any

    const { data: checkout } = await db
      .from('checkouts')
      .select(`
        id, status, booking_id,
        booking:bookings!inner (id, adults, children_paid, children_free, customer_name, booking_number)
      `)
      .eq('id', checkoutId)
      .maybeSingle()
    if (!checkout) return { success: false, error: 'Checkout not found' }
    if (checkout.status !== 'draft') {
      return { success: false, error: `Cannot adjust — checkout is ${checkout.status}.` }
    }

    const { error } = await db
      .from('checkouts')
      .update({
        actual_adults:               parsed.actual_adults,
        actual_children:             parsed.actual_children,
        guest_reduction_reason:      parsed.reason,
        guest_reduction_recorded_by: ctx?.user_id ?? null,
        guest_reduction_recorded_at: new Date().toISOString(),
      })
      .eq('id', checkoutId)
    if (error) return { success: false, error: error.message }

    const bookedAdults   = Number(checkout.booking.adults ?? 0)
    const bookedChildren = Number(checkout.booking.children_paid ?? 0) + Number(checkout.booking.children_free ?? 0)
    const summary = `Guest count adjusted — ${checkout.booking.customer_name} (${checkout.booking.booking_number})`
      + `: ${bookedAdults}A/${bookedChildren}C → ${parsed.actual_adults}A/${parsed.actual_children}C. Reason: ${parsed.reason}`

    await logHistory(checkoutId, 'edited', 'actual_guest_count_adjusted', {
      booking_id:      checkout.booking_id,
      actual_adults:   parsed.actual_adults,
      actual_children: parsed.actual_children,
      booked_adults:   bookedAdults,
      booked_children: bookedChildren,
      reason:          parsed.reason,
    })

    await flagAlert({
      event_type:  'guest_reduced',
      entity_type: 'checkout',
      entity_id:   checkoutId,
      summary,
      payload: {
        booking_id:      checkout.booking_id,
        actual_adults:   parsed.actual_adults,
        actual_children: parsed.actual_children,
        booked_adults:   bookedAdults,
        booked_children: bookedChildren,
        reason:          parsed.reason,
      },
      created_by: ctx?.user_id ?? null,
    })

    revalidatePath(`/checkout/${checkout.booking_id}`)
    revalidatePath('/settings/audit-log')
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}
