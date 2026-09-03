'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { generateBookingNumber, isUniqueViolation } from '@/lib/utils'
import { calculateDaylong, calculateNight, calculateGroup } from '@/lib/engine/calculator'
import { getHolidayDateStrings } from '@/lib/queries/settings'
import {
  checkAvailabilityConflict, findRoomNumberConflicts,
  checkGroupAvailabilityConflict, findGroupRoomNumberConflicts,
} from '@/lib/queries/availability'
import { rowsToSegments, deriveGroupHeader, type GroupSegment } from '@/lib/bookings/group-itinerary'
import { insertGroupDays, replaceGroupDays } from '@/lib/bookings/group-days-db'
import { findDuplicateBookings } from '@/lib/queries/duplicate-bookings'
import { ROOM_NUMBERS } from '@/lib/config/rooms'
import { requirePermission, getCurrentUserContext } from '@/lib/auth/permissions'
import { isMissingRelation } from '@/lib/supabase/errors'
import { getAdvanceDefaultAccountId, listAccountsForMethod } from '@/lib/queries/payment-accounts'
import { requiresAccount, missingAccountError } from '@/lib/payments/account-rules'
import { findUnassignedRoomNumbersError } from '@/lib/validators/quote'
import type { ActionResult, ActionData } from './types'
import type { RoomType, PackageType, PackageSnapshot } from '@/lib/supabase/types'

/** Convert a confirmed quote into a booking.
 *
 * If a non-cancelled booking already exists for the same guest+date+package,
 * returns success: false with a `duplicate` payload unless allowDuplicate=true.
 */
export async function convertQuoteToBooking(
  quoteId: string,
  allowDuplicate: boolean = false,
): Promise<ActionData<{ bookingId: string; bookingNumber: string }>> {
  await requirePermission('bookings', 'write')
  try {
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any

    // Fetch quote + rooms
    const { data: quote, error: qErr } = await db
      .from('quotes')
      .select('*')
      .eq('id', quoteId)
      .single()

    if (qErr || !quote) return { success: false, error: 'Quote not found' }

    // Already converted (double-click, two agents, a retry after a timeout):
    // hand back the existing booking instead of minting a second one.
    if (quote.converted_to_booking_id) {
      const { data: existing } = await db
        .from('bookings')
        .select('id, booking_number')
        .eq('id', quote.converted_to_booking_id)
        .single()
      if (existing) {
        return { success: true, data: { bookingId: existing.id, bookingNumber: existing.booking_number } }
      }
      return { success: false, error: 'This quote was already converted to a booking.' }
    }

    // Soft duplicate check — exclude the source quote itself
    if (!allowDuplicate) {
      const dupes = await findDuplicateBookings({
        phone:            quote.customer_phone,
        visit_date:       quote.visit_date,
        package_type:     quote.package_type,
        exclude_quote_id: quoteId,
      })
      if (dupes.length > 0) {
        return {
          success: false,
          error:   `An existing ${dupes[0].kind} (${dupes[0].number}) was found for this guest on the same date. Please confirm before converting.`,
          duplicate: { existing: dupes },
        }
      }
    }

    const { data: quoteRooms } = await db
      .from('quote_rooms')
      .select('*')
      .eq('quote_id', quoteId)

    // A group quote's rooms are its itinerary — checked date by date. The
    // range-based checks below then run over an empty room list and pass.
    let groupDays: GroupSegment[] = []
    if (quote.package_type === 'group') {
      const { data: qd } = await db.from('quote_days').select('*, rooms:quote_day_rooms(*)').eq('quote_id', quoteId)
      groupDays = rowsToSegments(qd ?? [])
      if (groupDays.length === 0) {
        return { success: false, error: 'This group quote has no itinerary yet — edit it and add the days first.' }
      }
      const cap = await checkGroupAvailabilityConflict(groupDays, { excludeQuoteId: quoteId })
      if (cap) return { success: false, error: `Cannot convert: ${cap}` }
      const clashes = await findGroupRoomNumberConflicts(groupDays)
      if (clashes.length > 0) {
        const unique = Array.from(new Set(clashes.map((c) => c.room)))
        return {
          success: false,
          error:
            `Room number${unique.length > 1 ? 's' : ''} already booked by another booking on ` +
            `${Array.from(new Set(clashes.map((c) => c.date))).join(', ')}: ${unique.join(', ')}. ` +
            `Edit the quote to pick different rooms, or cancel the conflicting booking first.`,
          conflict: { rooms: unique },
        }
      }
    }

    // Re-check capacity and physical room numbers at conversion time. The
    // initial availability check ran when the quote was created — but other
    // bookings may have claimed the same rooms in the meantime.
    const requestedRoomQtys = ((quoteRooms ?? []) as any[]).map((r) => ({
      room_type:     r.room_type as string,
      qty:           Number(r.qty ?? 0),
      room_numbers:  (r.room_numbers ?? []) as string[],
      evening_rooms: (r.evening_rooms ?? []) as string[],
    }))
    const capacityErr = await checkAvailabilityConflict(
      quote.visit_date,
      quote.check_out_date,
      requestedRoomQtys,
      undefined,
      quoteId,
    )
    if (capacityErr) {
      return { success: false, error: `Cannot convert: ${capacityErr}` }
    }

    // Catches legacy quotes saved before the room_numbers refine landed —
    // they could still have a room type with no physical room picked.
    const unassignedErr = findUnassignedRoomNumbersError(
      ((quoteRooms ?? []) as { room_type: string; qty: number; room_numbers: string[] }[]).filter((r) => r.qty > 0),
    )
    if (unassignedErr) return { success: false, error: `Cannot convert: ${unassignedErr}` }

    // Specific room numbers — guard against the same physical rooms being
    // claimed by another booking that confirmed first. A room the quote hands
    // over in the evening only needs its night free.
    const conflictingNumbers = await findRoomNumberConflicts(
      requestedRoomQtys, quote.visit_date, quote.check_out_date,
    )
    if (conflictingNumbers.length > 0) {
      const unique = Array.from(new Set(conflictingNumbers))
      return {
        success: false,
        error:
          `Room number${unique.length > 1 ? 's' : ''} already booked by another booking: ` +
          `${unique.join(', ')}. Edit the quote to pick different rooms, or cancel the ` +
          `conflicting booking first.`,
        // Structured payload so the UI can offer a "re-pick rooms" affordance
        // instead of a dead-end error (mirrors the `duplicate` channel).
        conflict: { rooms: unique },
      }
    }

    // Generate the booking number and insert. MAX+1 numbering can collide when
    // two conversions run at the same moment — the unique index rejects the
    // loser with 23505, and we retry with a freshly read number.
    let booking: { id: string; booking_number: string } | null = null
    let bErr: { message?: string } | null = null
    for (let attempt = 0; attempt < 3; attempt++) {
      const booking_number = await generateBookingNumber(supabase as any)
      const res = await db
      .from('bookings')
      .insert({
        booking_number,
        quote_id:         quote.id,
        customer_name:    quote.customer_name,
        customer_phone:   quote.customer_phone,
        customer_notes:   quote.customer_notes,
        package_type:     quote.package_type,
        visit_date:       quote.visit_date,
        // Belt for legacy quotes saved before the validator cleared this:
        // daylong never carries a check-out date.
        check_out_date:   quote.package_type === 'daylong' ? null : quote.check_out_date,
        adults:           quote.adults,
        children_paid:    quote.children_paid,
        children_free:    quote.children_free,
        drivers:          quote.drivers,
        extra_beds:       quote.extra_beds,
        subtotal:            quote.subtotal,
        discount:            quote.discount,
        discount_pct:        quote.discount_pct ?? 0,
        service_charge_pct:  quote.service_charge_pct ?? 0,
        advance_required:    quote.advance_required,
        advance_paid:        quote.advance_paid,
        advance_method:      quote.advance_method ?? 'bkash',
        status:              'confirmed',
        sales_employee_id:   quote.sales_employee_id ?? null,
        is_corporate:         (quote as any).is_corporate ?? false,
        company_name:         (quote as any).company_name ?? null,
        corporate_account_id: (quote as any).corporate_account_id ?? null,
        package_snapshot: quote.package_snapshot,
        day_package_snapshot: quote.day_package_snapshot ?? null,
        line_items:       quote.line_items,
        extra_items:      quote.extra_items ?? [],
      })
      .select('id, booking_number')
      .single()
      booking = res.data
      bErr    = res.error
      if (booking || !isUniqueViolation(res.error, 'booking_number')) break
    }

    if (bErr || !booking) return { success: false, error: bErr?.message ?? 'Booking insert failed' }

    // Copy quote rooms → booking rooms (including any pre-assigned room numbers).
    // If this insert fails the booking would exist with zero rooms — invisible
    // to every room-conflict check — so undo the booking rather than continue.
    if (quoteRooms?.length) {
      const { error: roomsErr } = await db.from('booking_rooms').insert(
        quoteRooms.map((r: any) => ({
          booking_id:   booking.id,
          room_type:    r.room_type as RoomType,
          qty:          r.qty,
          unit_price:   r.unit_price,
          room_numbers: r.room_numbers ?? [],
          evening_rooms: r.evening_rooms ?? [],
        })),
      )
      if (roomsErr) {
        await db.from('bookings').delete().eq('id', booking.id)
        return { success: false, error: `Could not copy rooms to the booking: ${roomsErr.message}` }
      }
    }

    // Copy the itinerary. Like the rooms above, a group booking without its
    // days is invisible to every availability check — undo rather than continue.
    if (quote.package_type === 'group') {
      const dayErr = await insertGroupDays(db, 'booking', booking.id, groupDays)
      if (dayErr) {
        await db.from('bookings').delete().eq('id', booking.id)
        return { success: false, error: `Could not copy the itinerary to the booking: ${dayErr}` }
      }
    }

    // The advance taken on the quote becomes the first instalment in the
    // booking's ledger, so every later top-up appends to a real history
    // instead of overwriting one opaque number.
    if (Number(quote.advance_paid ?? 0) > 0) {
      const advMethod = quote.advance_method ?? 'bkash'
      const { error: advErr } = await db.from('booking_advance_payments').insert({
        booking_id: booking.id,
        amount:     Number(quote.advance_paid),
        method:     advMethod,
        paid_at:    new Date().toISOString(),
        notes:      `Advance taken on quote ${quote.quote_number}`,
        // Bank transfer → EBL, bKash → the merchant wallet. Fixed per tender.
        account_id: await getAdvanceDefaultAccountId(advMethod).catch(() => null),
      })
      // Ledger table absent (migration 003 not run) — the booking still holds
      // advance_paid, so nothing is lost.
      if (advErr && !isMissingRelation(advErr)) {
        console.warn(`[bookings] advance ledger row not created: ${advErr.message}`)
      }
    }

    // Update quote: mark as confirmed + link to booking
    await db
      .from('quotes')
      .update({ status: 'confirmed', converted_to_booking_id: booking.id })
      .eq('id', quoteId)

    // History logs
    await db.from('history_log').insert([
      {
        entity_type: 'quote',
        entity_id:   quoteId,
        event:       'converted_to_booking',
        actor:       'system',
        payload:     { booking_id: booking.id, booking_number: booking.booking_number },
      },
      {
        entity_type: 'booking',
        entity_id:   booking.id,
        event:       'created',
        actor:       'system',
        payload:     { quote_id: quoteId, booking_number: booking.booking_number },
      },
    ])

    revalidatePath('/quotes')
    revalidatePath('/bookings')
    return { success: true, data: { bookingId: booking.id, bookingNumber: booking.booking_number } }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

/** Update advance payment on a booking */
export async function updateAdvancePaid(
  bookingId: string,
  advance_paid: number,
  advance_required: number,
  advance_method?: 'bkash' | 'bank_transfer',
): Promise<ActionResult> {
  await requirePermission('bookings', 'write')
  try {
    // Client-supplied money — validate before it reaches the row.
    for (const [label, v] of [['Advance paid', advance_paid], ['Advance required', advance_required]] as const) {
      if (!Number.isFinite(v) || v < 0 || v > 10_000_000) {
        return { success: false, error: `${label} must be a number between 0 and 1,00,00,000` }
      }
    }
    if (advance_method && !['bkash', 'bank_transfer'].includes(advance_method)) {
      return { success: false, error: 'Advance method must be bKash or bank transfer' }
    }

    const supabase = createClient()
    const { data: updated, error } = await supabase
      .from('bookings')
      .update({ advance_paid, advance_required, ...(advance_method ? { advance_method } : {}) })
      .eq('id', bookingId)
      .neq('status', 'cancelled')   // a cancelled booking's money must stay as it ended
      .select('id')

    if (error) return { success: false, error: error.message }
    if (!updated?.length) return { success: false, error: 'Booking not found, or it is cancelled' }

    await supabase.from('history_log').insert({
      entity_type: 'booking',
      entity_id:   bookingId,
      event:       'edited',
      actor:       'system',
      payload:     { field: 'advance', advance_paid, advance_required },
    })

    revalidatePath(`/bookings/${bookingId}`)
    return { success: true }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

// ─── Advance instalments ─────────────────────────────────────────────────────

/**
 * Recompute `bookings.advance_paid` from the instalment ledger.
 *
 * The column stays denormalised because the pricing engine, every "remaining"
 * figure and the invoice all read it — but the ledger is the truth, so it is
 * re-derived on every change rather than incremented.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function syncAdvanceTotal(db: any, bookingId: string): Promise<number> {
  const { data: rows } = await db
    .from('booking_advance_payments')
    .select('amount, method, paid_at')
    .eq('booking_id', bookingId)
    .order('paid_at', { ascending: true })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const list = (rows ?? []) as any[]
  const total = Math.round(list.reduce((s, r) => s + Number(r.amount ?? 0), 0) * 100) / 100
  await db.from('bookings').update({
    advance_paid: total,
    // The header method keeps meaning "how the FIRST advance arrived" — it is
    // what older screens and reports read when they want one word for it.
    ...(list.length ? { advance_method: list[0].method } : {}),
  }).eq('id', bookingId)
  return total
}

/**
 * Log another advance instalment — the second bKash, the bank transfer that
 * followed it — with the date and time it actually arrived.
 */
export async function addAdvancePayment(
  bookingId: string,
  input: {
    amount:    number
    method:    string
    /** ISO datetime-local from the form, or omitted for "now". */
    paid_at?:  string | null
    reference?: string | null
    notes?:    string | null
    /** Which account/wallet received it — drives statement reconciliation. */
    account_id?: string | null
  },
): Promise<ActionData<{ advance_paid: number }>> {
  await requirePermission('bookings', 'write')
  try {
    const amount = Number(input.amount)
    if (!Number.isFinite(amount) || amount <= 0 || amount > 10_000_000) {
      return { success: false, error: 'Enter the amount received' }
    }
    const METHODS = ['bkash', 'bank_transfer', 'cash', 'nagad', 'rocket', 'card', 'other']
    if (!METHODS.includes(input.method)) return { success: false, error: 'Pick how it was received' }

    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any

    const { data: booking } = await db.from('bookings')
      .select('id, status, booking_number').eq('id', bookingId).maybeSingle()
    if (!booking) return { success: false, error: 'Booking not found' }
    if (booking.status === 'cancelled') {
      return { success: false, error: 'This booking is cancelled — its payments are closed.' }
    }

    // A datetime-local value carries no zone; it is typed in Dhaka time.
    const paidAt = input.paid_at
      ? new Date(input.paid_at.length === 16 ? `${input.paid_at}:00+06:00` : input.paid_at).toISOString()
      : new Date().toISOString()

    // Advances land in a fixed place per tender — a bank transfer is always
    // EBL, bKash is always the merchant wallet — so the destination is resolved
    // here rather than asked for at the desk. An explicit choice still wins.
    const accountId = input.account_id
      ?? await getAdvanceDefaultAccountId(input.method).catch(() => null)

    // Card is the one tender with no fixed advance destination — three POS
    // machines — so it has to be named. Only enforced once terminals exist.
    if (requiresAccount(input.method) && !accountId) {
      const options = await listAccountsForMethod(input.method).catch(() => [])
      if (options.length > 0) {
        return { success: false, error: missingAccountError(input.method) }
      }
    }

    const ctx = await getCurrentUserContext()
    const { error } = await db.from('booking_advance_payments').insert({
      booking_id: bookingId,
      amount,
      method:     input.method,
      paid_at:    paidAt,
      reference:  input.reference?.trim() || null,
      notes:      input.notes?.trim() || null,
      account_id: accountId,
      recorded_by: ctx?.user_id ?? null,
    })
    if (error) {
      if (isMissingRelation(error)) {
        return { success: false, error: 'Run migrations/platform-audit/003_advance_payments_ledger.sql to start logging advance instalments.' }
      }
      return { success: false, error: error.message }
    }

    const total = await syncAdvanceTotal(db, bookingId)

    await db.from('history_log').insert({
      entity_type: 'booking', entity_id: bookingId, event: 'edited', actor: 'system',
      payload: { action: 'advance_payment_added', amount, method: input.method, paid_at: paidAt, advance_paid: total },
    })

    revalidatePath(`/bookings/${bookingId}`)
    revalidatePath('/bookings')
    return { success: true, data: { advance_paid: total } }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/** Remove a mis-keyed instalment. The total re-derives from what's left. */
export async function deleteAdvancePayment(paymentId: string): Promise<ActionResult> {
  await requirePermission('bookings', 'write')
  try {
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any

    const { data: row } = await db.from('booking_advance_payments')
      .select('id, booking_id, amount, method').eq('id', paymentId).maybeSingle()
    if (!row) return { success: false, error: 'Payment not found' }

    const { error } = await db.from('booking_advance_payments').delete().eq('id', paymentId)
    if (error) return { success: false, error: error.message }

    const total = await syncAdvanceTotal(db, row.booking_id)
    await db.from('history_log').insert({
      entity_type: 'booking', entity_id: row.booking_id, event: 'edited', actor: 'system',
      payload: { action: 'advance_payment_removed', amount: Number(row.amount), method: row.method, advance_paid: total },
    })

    revalidatePath(`/bookings/${row.booking_id}`)
    revalidatePath('/bookings')
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/** Cancel a booking */
export async function cancelBooking(bookingId: string): Promise<ActionResult> {
  await requirePermission('bookings', 'write')
  try {
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any

    // Pull the booking for the alert summary
    const { data: booking } = await db
      .from('bookings')
      .select('booking_number, customer_name, status')
      .eq('id', bookingId)
      .maybeSingle()

    const { error } = await supabase
      .from('bookings')
      .update({ status: 'cancelled' })
      .eq('id', bookingId)

    if (error) return { success: false, error: error.message }

    await supabase.from('history_log').insert({
      entity_type: 'booking',
      entity_id:   bookingId,
      event:       'status_changed',
      actor:       'system',
      payload:     { from: booking?.status ?? 'confirmed', to: 'cancelled' },
    })

    if (booking) {
      // Best-effort alert. Lazy-import to avoid circular module deps.
      const { flagAlert } = await import('@/lib/auth/alerts')
      const { getCurrentUserContext } = await import('@/lib/auth/permissions')
      const ctx = await getCurrentUserContext()
      await flagAlert({
        event_type:  'booking_cancelled',
        entity_type: 'booking',
        entity_id:   bookingId,
        summary:     `Booking ${booking.booking_number} cancelled — ${booking.customer_name}`,
        payload:     { from: booking.status ?? 'confirmed' },
        created_by:  ctx?.user_id ?? null,
      })
    }

    revalidatePath('/bookings')
    revalidatePath(`/bookings/${bookingId}`)
    revalidatePath('/settings/audit-log')
    return { success: true }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

/** Mark a confirmed booking as a no-show.
 *
 * The advance is non-refundable, so no money moves — the booking's advance_paid
 * stands as earned revenue and total_revenue accounting handles it (see
 * lib/queries/bookings.ts::getBookingStats and the get_booking_stats RPC).
 * The room is freed for resale (availability skips no_show like cancelled).
 * Any draft checkout is voided — the guest never incurred charges. */
export async function markNoShow(
  bookingId: string,
  input: { notes?: string } = {},
): Promise<ActionResult> {
  await requirePermission('checkout', 'write')
  try {
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any
    const { getCurrentUserContext } = await import('@/lib/auth/permissions')
    const ctx = await getCurrentUserContext()

    const { data: booking } = await db
      .from('bookings')
      .select('booking_number, customer_name, status, advance_paid')
      .eq('id', bookingId)
      .maybeSingle()
    if (!booking) return { success: false, error: 'Booking not found' }
    if (booking.status !== 'confirmed') {
      return { success: false, error: `Cannot mark as no-show — booking is ${booking.status}.` }
    }

    const now = new Date().toISOString()
    const { error } = await db
      .from('bookings')
      .update({ status: 'no_show', no_show_at: now, no_show_by: ctx?.user_id ?? null })
      .eq('id', bookingId)
    if (error) return { success: false, error: error.message }

    // Void any draft checkout — the guest never came, no charges to settle.
    const { data: draftCheckout } = await db
      .from('checkouts').select('id, status').eq('booking_id', bookingId).maybeSingle()
    if (draftCheckout?.status === 'draft') {
      await db.from('checkouts')
        .update({ status: 'voided', voided_at: now, voided_by: ctx?.user_id ?? null, void_reason: 'Guest did not arrive (no-show)' })
        .eq('id', draftCheckout.id)
    }

    await db.from('history_log').insert({
      entity_type: 'booking',
      entity_id:   bookingId,
      event:       'status_changed',
      actor:       'system',
      payload:     { from: 'confirmed', to: 'no_show', advance_retained: Number(booking.advance_paid ?? 0), notes: input.notes ?? null, by: ctx?.user_id ?? null },
    })

    const { flagAlert } = await import('@/lib/auth/alerts')
    await flagAlert({
      event_type:  'booking_no_show',
      entity_type: 'booking',
      entity_id:   bookingId,
      summary:     `Booking ${booking.booking_number} marked no-show — ${booking.customer_name}`,
      payload:     { advance_retained: Number(booking.advance_paid ?? 0) },
      created_by:  ctx?.user_id ?? null,
    })

    revalidatePath('/bookings')
    revalidatePath(`/bookings/${bookingId}`)
    revalidatePath('/checkout')
    revalidatePath(`/checkout/${bookingId}`)
    revalidatePath('/settings/audit-log')
    return { success: true }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

/** Reverse a no-show back to confirmed (mis-marks happen). Symmetric with
 *  reopenCheckout — undo only, doesn't auto-restart anything else. */
export async function reverseNoShow(bookingId: string): Promise<ActionResult> {
  await requirePermission('checkout', 'write')
  try {
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any
    const { getCurrentUserContext } = await import('@/lib/auth/permissions')
    const ctx = await getCurrentUserContext()

    const { data: booking } = await db
      .from('bookings').select('booking_number, status').eq('id', bookingId).maybeSingle()
    if (!booking) return { success: false, error: 'Booking not found' }
    if (booking.status !== 'no_show') {
      return { success: false, error: `Cannot reverse — booking is ${booking.status}, not no_show.` }
    }

    const { error } = await db
      .from('bookings')
      .update({ status: 'confirmed', no_show_at: null, no_show_by: null })
      .eq('id', bookingId)
    if (error) return { success: false, error: error.message }

    await db.from('history_log').insert({
      entity_type: 'booking',
      entity_id:   bookingId,
      event:       'status_changed',
      actor:       'system',
      payload:     { from: 'no_show', to: 'confirmed', reversed_by: ctx?.user_id ?? null },
    })

    revalidatePath('/bookings')
    revalidatePath(`/bookings/${bookingId}`)
    revalidatePath('/checkout')
    revalidatePath(`/checkout/${bookingId}`)
    return { success: true }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

/** Update a booking with recalculation (last-minute changes including rooms/guests) */
export async function updateBooking(
  bookingId: string,
  input: {
    customer_name:  string
    customer_phone: string
    customer_notes:     string | null
    discount:           number
    discount_pct:       number
    service_charge_pct: number
    advance_paid:       number
    advance_required:   number
    adults:        number
    children_paid: number
    children_free: number
    drivers:       number
    extra_beds:    number
    rooms: { room_type: RoomType; display_name: string; qty: number; unit_price: number; room_numbers: string[]; evening_rooms?: string[] }[]
    extra_items: { label: string; qty: number; unit_price: number }[]
    // context for recalculation
    package_type:     PackageType
    visit_date:       string
    check_out_date:   string | null
    package_snapshot: PackageSnapshot
    /** Group bookings only: the whole itinerary, replacing what is stored. */
    days?:                 GroupSegment[]
    day_package_snapshot?: PackageSnapshot | null
  },
): Promise<ActionResult> {
  await requirePermission('bookings', 'write')
  try {
    const supabase   = createClient()
    const holidayDates = await getHolidayDateStrings()

    const { rooms, extra_items, package_type, visit_date, check_out_date, package_snapshot, ...guestData } = input
    const groupDays: GroupSegment[] = package_type === 'group' ? (input.days ?? []) : []
    // A group's dates and headcount follow its itinerary.
    const header = package_type === 'group' ? deriveGroupHeader(groupDays) : null
    if (package_type === 'group' && !header) {
      return { success: false, error: 'A group booking needs at least one day in its itinerary' }
    }

    const unassignedErr = findUnassignedRoomNumbersError(rooms.filter((r) => r.qty > 0))
    if (unassignedErr) return { success: false, error: unassignedErr }

    // The rooms this edit names must be free on these dates — the room
    // picker greys out what it knows about, but another agent may have
    // booked in the meantime. Evening rooms only need the night.
    if (package_type !== 'group') {
      const clashes = await findRoomNumberConflicts(
        rooms.filter((r) => r.qty > 0).map((r) => ({
          room_type: r.room_type, qty: r.qty, room_numbers: r.room_numbers ?? [], evening_rooms: r.evening_rooms ?? [],
        })),
        visit_date, check_out_date, bookingId,
      )
      if (clashes.length > 0) {
        return { success: false, error: `Room ${clashes.join(', ')} is already booked by another booking on these dates` }
      }
    }

    // Same guard as date changes and room swaps: a cancelled or checked-out
    // booking's totals are history — rewriting them after the fact corrupts
    // revenue stats. (The Edit button renders regardless of status.)
    const { data: current } = await (supabase as any)
      .from('bookings')
      .select('status')
      .eq('id', bookingId)
      .single()
    if (!current) return { success: false, error: 'Booking not found' }
    if (current.status !== 'confirmed') {
      return { success: false, error: `Only confirmed bookings can be edited (this one is ${String(current.status).replace(/_/g, ' ')})` }
    }

    // Recalculate totals using the frozen snapshot
    let calc
    if (package_type === 'group') {
      const hasNight = groupDays.some((d) => d.stay_kind === 'night')
      const hasDay   = groupDays.some((d) => d.stay_kind === 'daylong')
      const daySnap  = input.day_package_snapshot ?? (hasNight ? null : package_snapshot)
      if (hasDay && !daySnap) return { success: false, error: 'This booking has no daylong package to price its day guests' }
      const cap = await checkGroupAvailabilityConflict(groupDays, { excludeBookingId: bookingId })
      if (cap) return { success: false, error: `Availability conflict: ${cap}` }
      const clashes = await findGroupRoomNumberConflicts(groupDays, bookingId)
      if (clashes.length > 0) {
        return { success: false, error: `Room ${Array.from(new Set(clashes.map((c) => c.room))).join(', ')} is already booked by another booking on ${Array.from(new Set(clashes.map((c) => c.date))).join(', ')}` }
      }
      calc = calculateGroup({
        segments:           groupDays,
        nightRates:         hasNight ? package_snapshot : null,
        dayRates:           daySnap,
        holidayDates,
        discount:           input.discount,
        discount_pct:       input.discount_pct,
        service_charge_pct: input.service_charge_pct,
        advance_required:   input.advance_required,
        advance_paid:       input.advance_paid,
        extra_items,
      })
    } else if (package_type === 'daylong') {
      calc = calculateDaylong({
        date:               new Date(visit_date + 'T00:00:00'),
        packageRates:       package_snapshot,
        rooms,
        adults:             input.adults,
        children_paid:      input.children_paid,
        children_free:      input.children_free,
        drivers:            input.drivers,
        holidayDates,
        discount:           input.discount,
        discount_pct:       input.discount_pct,
        service_charge_pct: input.service_charge_pct,
        advance_required:   input.advance_required,
        advance_paid:       input.advance_paid,
        extra_items,
      })
    } else {
      calc = calculateNight({
        checkInDate:        new Date(visit_date + 'T00:00:00'),
        checkOutDate:       new Date(check_out_date! + 'T00:00:00'),
        packageRates:       package_snapshot,
        rooms,
        adults:             input.adults,
        children_paid:      input.children_paid,
        children_free:      input.children_free,
        drivers:            input.drivers,
        extra_beds:         input.extra_beds,
        holidayDates,
        discount:           input.discount,
        discount_pct:       input.discount_pct,
        service_charge_pct: input.service_charge_pct,
        advance_required:   input.advance_required,
        advance_paid:       input.advance_paid,
        extra_items,
      })
    }

    // Replace booking rooms. Neither step used to be checked: a failed insert
    // left the booking with ZERO rooms while still reporting success — and a
    // roomless booking is invisible to every room-conflict check, so its rooms
    // could be sold twice. Capture the old rows first and restore them if the
    // insert fails.
    const { data: oldRooms } = await (supabase as any)
      .from('booking_rooms')
      .select('room_type, qty, unit_price, room_numbers')
      .eq('booking_id', bookingId)

    const { error: delErr } = await supabase.from('booking_rooms').delete().eq('booking_id', bookingId)
    if (delErr) return { success: false, error: `Could not update rooms: ${delErr.message}` }

    const activeRooms = rooms.filter((r) => r.qty > 0)
    if (activeRooms.length > 0) {
      const { error: insErr } = await supabase.from('booking_rooms').insert(
        activeRooms.map((r) => ({
          booking_id:   bookingId,
          room_type:    r.room_type,
          qty:          r.qty,
          unit_price:   r.unit_price,
          room_numbers: r.room_numbers ?? [],
          evening_rooms: (r.evening_rooms ?? []).filter((n) => (r.room_numbers ?? []).includes(n)),
        })),
      )
      if (insErr) {
        // Best-effort restore of the rooms we just deleted.
        if (oldRooms?.length) {
          await (supabase as any).from('booking_rooms').insert(
            oldRooms.map((r: any) => ({ ...r, booking_id: bookingId })),
          )
        }
        return { success: false, error: `Could not save rooms — the booking was left unchanged: ${insErr.message}` }
      }
    }

    if (package_type === 'group') {
      const dayErr = await replaceGroupDays(supabase as any, 'booking', bookingId, groupDays)  // eslint-disable-line @typescript-eslint/no-explicit-any
      if (dayErr) return { success: false, error: dayErr }
    }

    // Update the booking header AFTER the rooms landed, so a failure above
    // leaves the whole booking untouched rather than new totals on old rooms.
    const { error: bookingErr } = await supabase
      .from('bookings')
      .update({
        customer_name:    input.customer_name,
        customer_phone:   input.customer_phone,
        customer_notes:   input.customer_notes,
        discount:            calc.discount,
        discount_pct:        input.discount_pct,
        service_charge_pct:  input.service_charge_pct,
        advance_paid:        calc.advance_paid,
        advance_required:    calc.advance_required,
        adults:              header?.adults        ?? input.adults,
        children_paid:       header?.children_paid ?? input.children_paid,
        children_free:       header?.children_free ?? input.children_free,
        drivers:             header?.drivers       ?? input.drivers,
        extra_beds:          header?.extra_beds    ?? input.extra_beds,
        // A group's span moves with its itinerary; other types keep theirs
        // (dates change through confirmDateChange, which re-checks rooms).
        ...(header ? { visit_date: header.visit_date, check_out_date: header.check_out_date } : {}),
        subtotal:            calc.subtotal,
        line_items:          calc.line_items,
        extra_items,
      })
      .eq('id', bookingId)

    if (bookingErr) return { success: false, error: `Rooms were saved but the totals were not: ${bookingErr.message}` }

    await supabase.from('history_log').insert({
      entity_type: 'booking',
      entity_id:   bookingId,
      event:       'edited',
      actor:       'system',
      payload:     { adults: input.adults, children_paid: input.children_paid, rooms: activeRooms.length, new_total: calc.total },
    })

    revalidatePath(`/bookings/${bookingId}`)
    return { success: true }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

// ─── Change Booking Dates ────────────────────────────────────────────────────

/** Confirm a date change on a booking after user reviewed the preview */
export async function confirmDateChange(
  bookingId: string,
  input: {
    new_visit_date:     string
    new_check_out_date: string | null
    cleared_room_numbers: Record<string, string[]>
  },
): Promise<ActionResult> {
  await requirePermission('bookings', 'write')
  try {
    const supabase     = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db           = supabase as any
    const holidayDates = await getHolidayDateStrings()

    // Fetch booking
    const { data: booking, error: bErr } = await db
      .from('bookings')
      .select('*')
      .eq('id', bookingId)
      .single()

    if (bErr || !booking) return { success: false, error: 'Booking not found' }
    if (booking.status !== 'confirmed') return { success: false, error: 'Only confirmed bookings can have dates changed' }
    if (booking.package_type === 'group') return { success: false, error: "A group booking's dates come from its itinerary — edit the itinerary instead." }

    // Fetch rooms
    const { data: rooms } = await db
      .from('booking_rooms')
      .select('*')
      .eq('booking_id', bookingId)

    const bookingRooms = (rooms ?? []) as { id: string; room_type: RoomType; qty: number; unit_price: number; room_numbers: string[]; evening_rooms?: string[] }[]

    // Re-check availability (guard against race conditions). Room numbers the
    // preview cleared as conflicting are dropped from the request; evening
    // handover follows whichever of the room's numbers survive.
    const requestedRooms = bookingRooms.map((r) => {
      const keep = input.cleared_room_numbers[r.room_type] ?? r.room_numbers ?? []
      return {
        room_type: r.room_type, qty: r.qty,
        room_numbers: keep, evening_rooms: (r.evening_rooms ?? []).filter((n) => keep.includes(n)),
      }
    })
    const conflict = await checkAvailabilityConflict(
      input.new_visit_date,
      input.new_check_out_date,
      requestedRooms,
      bookingId,
    )
    if (conflict) return { success: false, error: `Availability conflict: ${conflict}` }

    // Recalculate pricing with new dates
    const snap = booking.package_snapshot
    const roomInputs = bookingRooms.map((r) => ({
      room_type:    r.room_type,
      display_name: r.room_type.replace(/_/g, ' '),
      qty:          r.qty,
      unit_price:   r.unit_price,
    }))

    const extraItems = booking.extra_items ?? []
    const storedPct = booking.discount_pct ?? 0
    const storedPctAmount = Math.round(booking.subtotal * storedPct / 100)
    const flatDiscount = Math.max(0, booking.discount - storedPctAmount)

    let calc
    if (booking.package_type === 'daylong') {
      calc = calculateDaylong({
        date:               new Date(input.new_visit_date + 'T00:00:00'),
        packageRates:       snap,
        rooms:              roomInputs,
        adults:             booking.adults,
        children_paid:      booking.children_paid,
        children_free:      booking.children_free,
        drivers:            booking.drivers,
        holidayDates,
        discount:           flatDiscount,
        discount_pct:       storedPct,
        service_charge_pct: booking.service_charge_pct ?? 0,
        advance_required:   booking.advance_required,
        advance_paid:       booking.advance_paid,
        extra_items:        extraItems,
      })
    } else {
      calc = calculateNight({
        checkInDate:        new Date(input.new_visit_date + 'T00:00:00'),
        checkOutDate:       new Date(input.new_check_out_date! + 'T00:00:00'),
        packageRates:       snap,
        rooms:              roomInputs,
        adults:             booking.adults,
        children_paid:      booking.children_paid,
        children_free:      booking.children_free,
        drivers:            booking.drivers,
        extra_beds:         booking.extra_beds,
        holidayDates,
        discount:           flatDiscount,
        discount_pct:       storedPct,
        service_charge_pct: booking.service_charge_pct ?? 0,
        advance_required:   booking.advance_required,
        advance_paid:       booking.advance_paid,
        extra_items:        extraItems,
      })
    }

    // Update booking dates + recalculated pricing
    const { error: updateErr } = await db
      .from('bookings')
      .update({
        visit_date:     input.new_visit_date,
        check_out_date: input.new_check_out_date,
        subtotal:       calc.subtotal,
        discount:       calc.discount,
        line_items:     calc.line_items,
      })
      .eq('id', bookingId)

    if (updateErr) return { success: false, error: updateErr.message }

    // Update room numbers (clear conflicting ones)
    for (const r of bookingRooms) {
      const finalNums = input.cleared_room_numbers[r.room_type] ?? r.room_numbers ?? []
      await db
        .from('booking_rooms')
        .update({
          room_numbers:  finalNums,
          evening_rooms: (r.evening_rooms ?? []).filter((n) => finalNums.includes(n)),
        })
        .eq('id', r.id)
    }

    // History log
    await db.from('history_log').insert({
      entity_type: 'booking',
      entity_id:   bookingId,
      event:       'edited',
      actor:       'system',
      payload:     {
        action:             'dates_changed',
        old_visit_date:     booking.visit_date,
        new_visit_date:     input.new_visit_date,
        old_check_out_date: booking.check_out_date,
        new_check_out_date: input.new_check_out_date,
        old_total:          booking.total,
        new_total:          calc.total,
      },
    })

    revalidatePath('/bookings')
    revalidatePath(`/bookings/${bookingId}`)
    return { success: true }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

// ─── Room Assignment Swap ────────────────────────────────────────────────────
//
// SwapInput targets specific booking_rooms rows by `id` rather than by room_type,
// because a single booking may have multiple rows of the same type (paid + comp).
// type_change mode also supports bidirectional paid ↔ comp conversion via to_charge_mode.

type SwapInput =
  | {
      mode: 'reassign'
      booking_room_id: string
      new_room_numbers: string[]
    }
  | {
      mode: 'swap'
      target_booking_id: string
      source_booking_room_id: string
      target_booking_room_id: string
      source_new_numbers: string[]   // numbers source row ends up with
      target_new_numbers: string[]   // numbers target row ends up with
    }
  | {
      mode: 'type_change'
      booking_room_id:  string
      to_room_type:     RoomType
      to_charge_mode:   'paid' | 'comp'   // 'comp' forces unit_price=0 regardless of snapshot
      new_room_numbers: string[]
    }

/** Swap or reassign room assignments on a confirmed booking */
export async function swapRoomAssignment(
  bookingId: string,
  input: SwapInput,
): Promise<ActionResult> {
  await requirePermission('bookings', 'write')
  try {
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any

    // Fetch booking
    const { data: booking, error: bErr } = await db
      .from('bookings')
      .select('*')
      .eq('id', bookingId)
      .single()

    if (bErr || !booking) return { success: false, error: 'Booking not found' }
    if (booking.status !== 'confirmed') return { success: false, error: 'Only confirmed bookings can have rooms swapped' }
    if (booking.package_type === 'group') return { success: false, error: "A group booking's rooms live in its itinerary — edit the itinerary instead." }

    // Fetch rooms
    const { data: rooms } = await db
      .from('booking_rooms')
      .select('*')
      .eq('booking_id', bookingId)

    const bookingRooms = (rooms ?? []) as { id: string; room_type: RoomType; qty: number; unit_price: number; room_numbers: string[] }[]

    // ── Mode: Reassign room numbers (target specific row by ID) ──────────────
    if (input.mode === 'reassign') {
      const roomRow = bookingRooms.find((r) => r.id === input.booking_room_id)
      if (!roomRow) return { success: false, error: 'Room row not found in this booking' }

      const validNums = ROOM_NUMBERS[roomRow.room_type] ?? []
      for (const num of input.new_room_numbers) {
        if (!validNums.includes(num)) {
          return { success: false, error: `Room ${num} is not a valid ${roomRow.room_type} room` }
        }
      }

      // Check not taken by other bookings (exclude self). A room that was
      // handed over in the evening keeps that flag if it stays on the row; a
      // replacement room is instant unless the edit screen says otherwise.
      const keptEvening = ((roomRow as { evening_rooms?: string[] }).evening_rooms ?? [])
        .filter((n) => input.new_room_numbers.includes(n))
      const clashes = await findRoomNumberConflicts(
        [{ room_type: roomRow.room_type, qty: roomRow.qty, room_numbers: input.new_room_numbers, evening_rooms: keptEvening }],
        booking.visit_date, booking.check_out_date, bookingId,
      )
      if (clashes.length > 0) {
        return { success: false, error: `Room ${clashes.join(', ')} is already booked by another booking on these dates` }
      }
      // Also check against other rows in THIS booking (paid+comp can't share numbers)
      for (const other of bookingRooms) {
        if (other.id === roomRow.id) continue
        for (const num of input.new_room_numbers) {
          if ((other.room_numbers ?? []).includes(num)) {
            return { success: false, error: `Room ${num} is already assigned to another row in this booking` }
          }
        }
      }

      await db.from('booking_rooms').update({ room_numbers: input.new_room_numbers, evening_rooms: keptEvening }).eq('id', roomRow.id)

      await db.from('history_log').insert({
        entity_type: 'booking',
        entity_id:   bookingId,
        event:       'edited',
        actor:       'system',
        payload:     {
          action:           'rooms_swapped',
          mode:             'reassign',
          room_type:        roomRow.room_type,
          charge_mode:      roomRow.unit_price === 0 ? 'comp' : 'paid',
          old_room_numbers: roomRow.room_numbers,
          new_room_numbers: input.new_room_numbers,
        },
      })

      revalidatePath(`/bookings/${bookingId}`)
      return { success: true }
    }

    // ── Mode: Swap between two bookings (row-level by ID) ────────────────────
    if (input.mode === 'swap') {
      const { data: targetBooking, error: tErr } = await db
        .from('bookings')
        .select('*')
        .eq('id', input.target_booking_id)
        .single()

      if (tErr || !targetBooking) return { success: false, error: 'Target booking not found' }
      if (targetBooking.status !== 'confirmed') return { success: false, error: 'Cannot swap with a cancelled booking' }

      const { data: targetRooms } = await db
        .from('booking_rooms')
        .select('*')
        .eq('booking_id', input.target_booking_id)

      const targetBookingRooms = (targetRooms ?? []) as { id: string; room_type: RoomType; qty: number; unit_price: number; room_numbers: string[] }[]

      const sourceRow = bookingRooms.find((r) => r.id === input.source_booking_room_id)
      const targetRow = targetBookingRooms.find((r) => r.id === input.target_booking_room_id)

      if (!sourceRow) return { success: false, error: 'Source row not found in this booking' }
      if (!targetRow) return { success: false, error: 'Target row not found in target booking' }

      // Both rows must be the same room_type for a direct number swap (v1 constraint)
      if (sourceRow.room_type !== targetRow.room_type) {
        return { success: false, error: 'Swap requires matching room types on both sides' }
      }

      // Validate requested output numbers are valid for this room type
      const validNums = ROOM_NUMBERS[sourceRow.room_type] ?? []
      for (const num of [...input.source_new_numbers, ...input.target_new_numbers]) {
        if (!validNums.includes(num)) {
          return { success: false, error: `Room ${num} is not a valid ${sourceRow.room_type} room` }
        }
      }
      if (input.source_new_numbers.length !== sourceRow.qty) {
        return { success: false, error: `Source row must end up with ${sourceRow.qty} room numbers` }
      }
      if (input.target_new_numbers.length !== targetRow.qty) {
        return { success: false, error: `Target row must end up with ${targetRow.qty} room numbers` }
      }

      // The two rows' output sets must partition the input (no dupes, no dropped numbers)
      const unionIn  = new Set<string>([...(sourceRow.room_numbers ?? []), ...(targetRow.room_numbers ?? [])])
      const unionOut = new Set<string>([...input.source_new_numbers, ...input.target_new_numbers])
      if (unionIn.size !== unionOut.size || [...unionIn].some((n) => !unionOut.has(n))) {
        return { success: false, error: 'Swap output must use the same set of room numbers as the input' }
      }

      await db.from('booking_rooms').update({ room_numbers: input.source_new_numbers }).eq('id', sourceRow.id)
      await db.from('booking_rooms').update({ room_numbers: input.target_new_numbers }).eq('id', targetRow.id)

      const srcChargeMode = sourceRow.unit_price === 0 ? 'comp' : 'paid'
      const tgtChargeMode = targetRow.unit_price === 0 ? 'comp' : 'paid'

      await db.from('history_log').insert([
        { entity_type: 'booking', entity_id: bookingId, event: 'edited', actor: 'system',
          payload: {
            action: 'rooms_swapped', mode: 'swap',
            swapped_with: targetBooking.booking_number,
            room_type: sourceRow.room_type,
            own_charge_mode: srcChargeMode,
            other_charge_mode: tgtChargeMode,
            old_numbers: sourceRow.room_numbers,
            new_numbers: input.source_new_numbers,
          } },
        { entity_type: 'booking', entity_id: input.target_booking_id, event: 'edited', actor: 'system',
          payload: {
            action: 'rooms_swapped', mode: 'swap',
            swapped_with: booking.booking_number,
            room_type: targetRow.room_type,
            own_charge_mode: tgtChargeMode,
            other_charge_mode: srcChargeMode,
            old_numbers: targetRow.room_numbers,
            new_numbers: input.target_new_numbers,
          } },
      ])

      revalidatePath(`/bookings/${bookingId}`)
      revalidatePath(`/bookings/${input.target_booking_id}`)
      return { success: true }
    }

    // ── Mode: Change room type / charge mode (paid ↔ comp, type upgrade, etc) ─
    if (input.mode === 'type_change') {
      const snap = booking.package_snapshot

      // Locate the target row (paid or comp) by ID
      const oldRow = bookingRooms.find((r) => r.id === input.booking_room_id)
      if (!oldRow) return { success: false, error: 'Row not found in this booking' }

      // Determine the post-conversion unit_price
      const snapPrice = (snap.room_prices as Record<string, number>)[input.to_room_type]
      if (input.to_charge_mode === 'paid' && snapPrice === undefined) {
        return { success: false, error: `${input.to_room_type.replace(/_/g, ' ')} is not priced in this package — cannot convert to paid` }
      }
      const newUnitPrice = input.to_charge_mode === 'comp' ? 0 : snapPrice

      // Availability check only matters when the room_type actually changes
      // (same-type paid↔comp flip doesn't change physical occupancy)
      if (oldRow.room_type !== input.to_room_type) {
        const conflict = await checkAvailabilityConflict(
          booking.visit_date,
          booking.check_out_date,
          [{ room_type: input.to_room_type, qty: oldRow.qty }],
          bookingId,
        )
        if (conflict) return { success: false, error: `Availability conflict: ${conflict}` }
      }

      // Validate new room numbers
      if (input.new_room_numbers.length > 0) {
        const validNums = ROOM_NUMBERS[input.to_room_type] ?? []
        for (const num of input.new_room_numbers) {
          if (!validNums.includes(num)) {
            return { success: false, error: `Room ${num} is not a valid ${input.to_room_type} room` }
          }
        }
        // Re-check against other bookings (self excluded). Evening flags
        // follow the numbers that survive the change.
        const keptEvening = ((oldRow as { evening_rooms?: string[] }).evening_rooms ?? [])
          .filter((n) => input.new_room_numbers.includes(n))
        const clashes = await findRoomNumberConflicts(
          [{ room_type: input.to_room_type, qty: oldRow.qty, room_numbers: input.new_room_numbers, evening_rooms: keptEvening }],
          booking.visit_date, booking.check_out_date, bookingId,
        )
        if (clashes.length > 0) {
          return { success: false, error: `Room ${clashes.join(', ')} is already booked on these dates` }
        }
        // Check against other rows in this booking
        for (const other of bookingRooms) {
          if (other.id === oldRow.id) continue
          for (const num of input.new_room_numbers) {
            if ((other.room_numbers ?? []).includes(num)) {
              return { success: false, error: `Room ${num} is already on another row in this booking` }
            }
          }
        }
      }

      // Apply the update — in place on the same row (no delete/insert dance needed
      // since we now target by ID and don't merge into a same-type row)
      await db.from('booking_rooms').update({
        room_type:    input.to_room_type,
        unit_price:   newUnitPrice,
        room_numbers: input.new_room_numbers,
        evening_rooms: ((oldRow as { evening_rooms?: string[] }).evening_rooms ?? []).filter((n) => input.new_room_numbers.includes(n)),
      }).eq('id', oldRow.id)

      // Recalculate entire booking
      const holidayDates = await getHolidayDateStrings()
      const { data: updatedRooms } = await db
        .from('booking_rooms')
        .select('*')
        .eq('booking_id', bookingId)

      const roomInputs = (updatedRooms ?? []).map((r: any) => ({
        room_type:    r.room_type,
        display_name: r.room_type.replace(/_/g, ' '),
        qty:          r.qty,
        unit_price:   r.unit_price,
      }))

      const extraItems = booking.extra_items ?? []
      const storedPct = booking.discount_pct ?? 0
      const storedPctAmount = Math.round(booking.subtotal * storedPct / 100)
      const flatDiscount = Math.max(0, booking.discount - storedPctAmount)

      let calc
      if (booking.package_type === 'daylong') {
        calc = calculateDaylong({
          date:               new Date(booking.visit_date + 'T00:00:00'),
          packageRates:       snap,
          rooms:              roomInputs,
          adults:             booking.adults,
          children_paid:      booking.children_paid,
          children_free:      booking.children_free,
          drivers:            booking.drivers,
          holidayDates,
          discount:           flatDiscount,
          discount_pct:       storedPct,
          service_charge_pct: booking.service_charge_pct ?? 0,
          advance_required:   booking.advance_required,
          advance_paid:       booking.advance_paid,
          extra_items:        extraItems,
        })
      } else {
        calc = calculateNight({
          checkInDate:        new Date(booking.visit_date + 'T00:00:00'),
          checkOutDate:       new Date(booking.check_out_date! + 'T00:00:00'),
          packageRates:       snap,
          rooms:              roomInputs,
          adults:             booking.adults,
          children_paid:      booking.children_paid,
          children_free:      booking.children_free,
          drivers:            booking.drivers,
          extra_beds:         booking.extra_beds,
          holidayDates,
          discount:           flatDiscount,
          discount_pct:       storedPct,
          service_charge_pct: booking.service_charge_pct ?? 0,
          advance_required:   booking.advance_required,
          advance_paid:       booking.advance_paid,
          extra_items:        extraItems,
        })
      }

      await db.from('bookings').update({
        subtotal:   calc.subtotal,
        discount:   calc.discount,
        line_items: calc.line_items,
      }).eq('id', bookingId)

      await db.from('history_log').insert({
        entity_type: 'booking',
        entity_id:   bookingId,
        event:       'edited',
        actor:       'system',
        payload:     {
          action:           'rooms_swapped',
          mode:             'type_change',
          from_room_type:   oldRow.room_type,
          to_room_type:     input.to_room_type,
          from_charge_mode: oldRow.unit_price === 0 ? 'comp' : 'paid',
          to_charge_mode:   input.to_charge_mode,
          qty:              oldRow.qty,
          old_total:        booking.total,
          new_total:        calc.total,
        },
      })

      revalidatePath(`/bookings/${bookingId}`)
      return { success: true }
    }

    return { success: false, error: 'Invalid swap mode' }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

// ─── Sales attribution: re-assign rep on a booking ──────────────────────────

export async function setBookingSalesRep(
  bookingId: string,
  employeeId: string | null,
): Promise<ActionResult> {
  try {
    const { requirePermission, getCurrentUserContext } = await import('@/lib/auth/permissions')
    await requirePermission('bookings', 'write')
    const ctx = await getCurrentUserContext()
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any

    // Validate the employee is a sales-eligible HR record
    if (employeeId) {
      const { data: emp } = await db
        .from('employees')
        .select('id, is_sales, employment_status')
        .eq('id', employeeId)
        .maybeSingle()
      if (!emp)              return { success: false, error: 'Employee not found' }
      if (!emp.is_sales)     return { success: false, error: 'Employee is not flagged as a sales rep.' }
    }

    const { data: prev } = await db
      .from('bookings').select('sales_employee_id').eq('id', bookingId).maybeSingle()

    const { error } = await db
      .from('bookings')
      .update({ sales_employee_id: employeeId })
      .eq('id', bookingId)
    if (error) return { success: false, error: error.message }

    await db.from('history_log').insert({
      entity_type: 'booking',
      entity_id:   bookingId,
      event:       'edited',
      actor:       'system',
      payload: {
        action: 'sales_rep_changed',
        from:   prev?.sales_employee_id ?? null,
        to:     employeeId,
        by:     ctx?.user_id ?? null,
      },
    }).catch((e: any) => console.warn(`[history_log] non-fatal: ${e?.message ?? e}`))

    revalidatePath(`/bookings/${bookingId}`)
    revalidatePath('/hr/sales')
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}
