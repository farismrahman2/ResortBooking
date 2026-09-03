'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { CreateQuoteSchema, type CreateQuoteInput } from '@/lib/validators/quote'
import { calculateDaylong, calculateNight, calculateGroup } from '@/lib/engine/calculator'
import { buildPackageSnapshot } from '@/lib/engine/snapshot'
import { generateQuoteNumber, isUniqueViolation } from '@/lib/utils'
import { getHolidayDateStrings } from '@/lib/queries/settings'
import { checkAvailabilityConflict, checkGroupAvailabilityConflict } from '@/lib/queries/availability'
import { replaceGroupDays, insertGroupDays } from '@/lib/bookings/group-days-db'
import type { GroupSegment } from '@/lib/bookings/group-itinerary'
import type { PackageSnapshot } from '@/lib/supabase/types'
import { findDuplicateBookings } from '@/lib/queries/duplicate-bookings'
import { requirePermission } from '@/lib/auth/permissions'
import type { ActionResult, ActionData } from './types'
import type { BookingStatus, RoomType } from '@/lib/supabase/types'

/** Create a new quote with full calculation and snapshot.
 *
 * If a non-cancelled quote/booking already exists for the same
 * (customer_phone, visit_date, package_type), the call returns
 * `success: false` with a `duplicate.existing` payload UNLESS
 * `allowDuplicate=true`. Front-end shows a confirmation modal and
 * re-submits with the override.
 */
export async function createQuote(
  input: CreateQuoteInput,
  allowDuplicate: boolean = false,
): Promise<ActionData<{ quoteId: string; quoteNumber: string }>> {
  await requirePermission('bookings', 'write')
  try {
    const validated = CreateQuoteSchema.parse(input)
    const supabase  = createClient()

    // Soft duplicate check (skip if user already overrode)
    if (!allowDuplicate) {
      const dupes = await findDuplicateBookings({
        phone:        validated.customer_phone,
        visit_date:   validated.visit_date,
        package_type: validated.package_type,
      })
      if (dupes.length > 0) {
        return {
          success: false,
          error:   `An existing ${dupes[0].kind} (${dupes[0].number}) was found for this guest on the same date. Please confirm before creating another.`,
          duplicate: { existing: dupes },
        }
      }
    }

    // Fetch package + room prices for snapshot (two packages for a group)
    const loaded = await loadSnapshots(supabase, validated)
    if ('error' in loaded) return { success: false, error: loaded.error }
    const { snapshot, daySnapshot, hasNight } = loaded
    const holidayDates = await getHolidayDateStrings()

    // Build room selections from validated input
    const rooms = validated.rooms.map((r) => ({
      room_type:    r.room_type,
      display_name: r.display_name,
      qty:          r.qty,
      unit_price:   r.unit_price,
    }))

    // Run calculation
    let calcResult
    if (validated.package_type === 'daylong') {
      calcResult = calculateDaylong({
        date:               new Date(validated.visit_date + 'T00:00:00'),
        packageRates:       snapshot,
        rooms,
        adults:             validated.adults,
        children_paid:      validated.children_paid,
        children_free:      validated.children_free,
        drivers:            validated.drivers,
        holidayDates,
        discount:           validated.discount,
        discount_pct:       validated.discount_pct ?? 0,
        service_charge_pct: validated.service_charge_pct ?? 0,
        advance_required:   validated.advance_required,
        advance_paid:       validated.advance_paid,
        extra_items:        validated.extra_items ?? [],
      })
    } else if (validated.package_type === 'group') {
      calcResult = calculateGroup({
        segments:           validated.days as GroupSegment[],
        nightRates:         hasNight ? snapshot : null,
        dayRates:           daySnapshot,
        holidayDates,
        discount:           validated.discount,
        discount_pct:       validated.discount_pct ?? 0,
        service_charge_pct: validated.service_charge_pct ?? 0,
        advance_required:   validated.advance_required,
        advance_paid:       validated.advance_paid,
        extra_items:        validated.extra_items ?? [],
      })
    } else {
      calcResult = calculateNight({
        checkInDate:        new Date(validated.visit_date + 'T00:00:00'),
        checkOutDate:       new Date(validated.check_out_date! + 'T00:00:00'),
        packageRates:       snapshot,
        rooms,
        adults:             validated.adults,
        children_paid:      validated.children_paid,
        children_free:      validated.children_free,
        drivers:            validated.drivers,
        extra_beds:         validated.extra_beds,
        holidayDates,
        discount:           validated.discount,
        discount_pct:       validated.discount_pct ?? 0,
        service_charge_pct: validated.service_charge_pct ?? 0,
        advance_required:   validated.advance_required,
        advance_paid:       validated.advance_paid,
        extra_items:        validated.extra_items ?? [],
      })
    }

    // Availability pre-check — block if any requested room is over capacity
    const conflict = validated.package_type === 'group'
      ? await checkGroupAvailabilityConflict(validated.days as GroupSegment[])
      : await checkAvailabilityConflict(
          validated.visit_date,
          validated.check_out_date ?? null,
          validated.rooms.map((r) => ({
            room_type: r.room_type, qty: r.qty,
            room_numbers: r.room_numbers ?? [], evening_rooms: r.evening_rooms ?? [],
          })),
        )
    if (conflict) return { success: false, error: `Availability conflict: ${conflict}` }

    // Generate the quote number and insert. MAX+1 can collide when two agents
    // save at the same moment — the unique index rejects the loser with 23505
    // and we retry with a freshly read number.
    let quote: { id: string; quote_number: string } | null = null
    let quoteError: { message?: string } | null = null
    for (let attempt = 0; attempt < 3; attempt++) {
      const quote_number = await generateQuoteNumber(supabase as any)
      const res = await supabase
      .from('quotes')
      .insert({
        quote_number,
        customer_name:    validated.customer_name,
        customer_phone:   validated.customer_phone,
        customer_notes:   validated.customer_notes ?? null,
        package_type:     validated.package_type,
        visit_date:       validated.visit_date,
        check_out_date:   validated.check_out_date ?? null,
        adults:           validated.adults,
        children_paid:    validated.children_paid,
        children_free:    validated.children_free,
        drivers:          validated.drivers,
        extra_beds:       validated.extra_beds,
        subtotal:            calcResult.subtotal,
        discount:            calcResult.discount,
        discount_pct:        validated.discount_pct ?? 0,
        service_charge_pct:  validated.service_charge_pct ?? 0,
        advance_required:    calcResult.advance_required,
        advance_paid:        calcResult.advance_paid,
        advance_method:      validated.advance_method ?? 'bkash',
        status:              'draft',
        sales_employee_id:   validated.sales_employee_id ?? null,
        is_corporate:         validated.is_corporate ?? false,
        company_name:         validated.is_corporate ? (validated.company_name?.trim() ?? null) : null,
        corporate_account_id: validated.is_corporate ? (validated.corporate_account_id ?? null) : null,
        package_snapshot: snapshot,
        day_package_snapshot: daySnapshot,
        line_items:       calcResult.line_items,
        extra_items:      validated.extra_items ?? [],
      })
      .select('id, quote_number')
      .single()
      quote      = res.data
      quoteError = res.error
      if (quote || !isUniqueViolation(res.error, 'quote_number')) break
    }

    if (quoteError || !quote) return { success: false, error: quoteError?.message ?? 'Insert failed' }

    // Insert quote rooms — a quote without its rooms is invisible to the
    // capacity checks, so undo the header if this fails.
    const roomRows = validated.rooms.map((r) => ({
      quote_id:     quote.id,
      room_type:    r.room_type as RoomType,
      qty:          r.qty,
      unit_price:   r.unit_price,
      room_numbers: r.room_numbers ?? [],
      evening_rooms: (r.evening_rooms ?? []).filter((n) => (r.room_numbers ?? []).includes(n)),
    }))

    if (roomRows.length > 0) {
      const { error: roomsErr } = await supabase.from('quote_rooms').insert(roomRows)
      if (roomsErr) {
        await supabase.from('quotes').delete().eq('id', quote.id)
        return { success: false, error: `Could not save the quote's rooms: ${roomsErr.message}` }
      }
    }

    // Itinerary — a group quote without its days is invisible to every
    // availability check, so undo the header rather than continue.
    if (validated.package_type === 'group') {
      const dayErr = await insertGroupDays(supabase as any, 'quote', quote.id, validated.days as GroupSegment[])  // eslint-disable-line @typescript-eslint/no-explicit-any
      if (dayErr) {
        await supabase.from('quotes').delete().eq('id', quote.id)
        return { success: false, error: dayErr }
      }
    }

    // Log history
    await supabase.from('history_log').insert({
      entity_type: 'quote',
      entity_id:   quote.id,
      event:       'created',
      actor:       'system',
      payload:     { quote_number: quote.quote_number, customer_name: validated.customer_name },
    })

    revalidatePath('/quotes')
    return { success: true, data: { quoteId: quote.id, quoteNumber: quote.quote_number } }
  } catch (err: any) {
    return { success: false, error: err?.message ?? String(err) }
  }
}

/** Update an existing draft/sent quote (full recalculation) */
export async function updateQuote(
  id: string,
  input: CreateQuoteInput,
): Promise<ActionResult> {
  await requirePermission('bookings', 'write')
  try {
    const validated = CreateQuoteSchema.parse(input)
    const supabase  = createClient()

    // Editable = draft, sent, or confirmed-but-not-yet-converted. This must
    // mirror the edit page's own guard (app/(agent)/quotes/[id]/edit) — it
    // used to allow only draft/sent, so a confirmed quote's edit form let you
    // fill everything in and then rejected the save at the last step.
    const { data: existing } = await supabase
      .from('quotes')
      .select('status, converted_to_booking_id')
      .eq('id', id)
      .single()

    if (!existing) return { success: false, error: 'Quote not found' }
    const editable = ['draft', 'sent'].includes(existing.status)
      || (existing.status === 'confirmed' && !existing.converted_to_booking_id)
    if (!editable) {
      return {
        success: false,
        error: existing.converted_to_booking_id
          ? 'This quote was converted to a booking — edit the booking instead.'
          : 'Only draft, sent, or unconverted confirmed quotes can be edited',
      }
    }

    // Fetch package + room prices for snapshot (two packages for a group)
    const loaded = await loadSnapshots(supabase, validated)
    if ('error' in loaded) return { success: false, error: loaded.error }
    const { snapshot, daySnapshot, hasNight } = loaded
    const holidayDates = await getHolidayDateStrings()

    // Editing a quote never re-checked capacity; a group's itinerary is
    // checked here because it is the only place its per-date rooms are known.
    if (validated.package_type === 'group') {
      const conflict = await checkGroupAvailabilityConflict(validated.days as GroupSegment[], { excludeQuoteId: id })
      if (conflict) return { success: false, error: `Availability conflict: ${conflict}` }
    }

    const rooms = validated.rooms.map((r) => ({
      room_type:    r.room_type,
      display_name: r.display_name,
      qty:          r.qty,
      unit_price:   r.unit_price,
    }))

    let calcResult
    if (validated.package_type === 'daylong') {
      calcResult = calculateDaylong({
        date:               new Date(validated.visit_date + 'T00:00:00'),
        packageRates:       snapshot,
        rooms,
        adults:             validated.adults,
        children_paid:      validated.children_paid,
        children_free:      validated.children_free,
        drivers:            validated.drivers,
        holidayDates,
        discount:           validated.discount,
        discount_pct:       validated.discount_pct ?? 0,
        service_charge_pct: validated.service_charge_pct ?? 0,
        advance_required:   validated.advance_required,
        advance_paid:       validated.advance_paid,
        extra_items:        validated.extra_items ?? [],
      })
    } else if (validated.package_type === 'group') {
      calcResult = calculateGroup({
        segments:           validated.days as GroupSegment[],
        nightRates:         hasNight ? snapshot : null,
        dayRates:           daySnapshot,
        holidayDates,
        discount:           validated.discount,
        discount_pct:       validated.discount_pct ?? 0,
        service_charge_pct: validated.service_charge_pct ?? 0,
        advance_required:   validated.advance_required,
        advance_paid:       validated.advance_paid,
        extra_items:        validated.extra_items ?? [],
      })
    } else {
      calcResult = calculateNight({
        checkInDate:        new Date(validated.visit_date + 'T00:00:00'),
        checkOutDate:       new Date(validated.check_out_date! + 'T00:00:00'),
        packageRates:       snapshot,
        rooms,
        adults:             validated.adults,
        children_paid:      validated.children_paid,
        children_free:      validated.children_free,
        drivers:            validated.drivers,
        extra_beds:         validated.extra_beds,
        holidayDates,
        discount:           validated.discount,
        discount_pct:       validated.discount_pct ?? 0,
        service_charge_pct: validated.service_charge_pct ?? 0,
        advance_required:   validated.advance_required,
        advance_paid:       validated.advance_paid,
        extra_items:        validated.extra_items ?? [],
      })
    }

    // Update quote record
    const { error: updateError } = await supabase
      .from('quotes')
      .update({
        customer_name:    validated.customer_name,
        customer_phone:   validated.customer_phone,
        customer_notes:   validated.customer_notes ?? null,
        package_type:     validated.package_type,
        visit_date:       validated.visit_date,
        check_out_date:   validated.check_out_date ?? null,
        adults:           validated.adults,
        children_paid:    validated.children_paid,
        children_free:    validated.children_free,
        drivers:          validated.drivers,
        extra_beds:       validated.extra_beds,
        subtotal:            calcResult.subtotal,
        discount:            calcResult.discount,
        discount_pct:        validated.discount_pct ?? 0,
        service_charge_pct:  validated.service_charge_pct ?? 0,
        advance_required:    calcResult.advance_required,
        advance_paid:        calcResult.advance_paid,
        advance_method:      validated.advance_method ?? 'bkash',
        sales_employee_id:   validated.sales_employee_id ?? null,
        is_corporate:         validated.is_corporate ?? false,
        company_name:         validated.is_corporate ? (validated.company_name?.trim() ?? null) : null,
        corporate_account_id: validated.is_corporate ? (validated.corporate_account_id ?? null) : null,
        package_snapshot: snapshot,
        day_package_snapshot: daySnapshot,
        line_items:       calcResult.line_items,
        extra_items:      validated.extra_items ?? [],
      })
      .eq('id', id)

    if (updateError) return { success: false, error: updateError.message }

    // Replace quote rooms — checked, with restore. A failed insert after the
    // delete used to leave the quote roomless (and report success), making it
    // invisible to capacity checks.
    const { data: oldRooms } = await supabase.from('quote_rooms')
      .select('room_type, qty, unit_price, room_numbers').eq('quote_id', id)
    const { error: delErr } = await supabase.from('quote_rooms').delete().eq('quote_id', id)
    if (delErr) return { success: false, error: `Could not update rooms: ${delErr.message}` }
    const roomRows = validated.rooms.map((r) => ({
      quote_id:     id,
      room_type:    r.room_type as RoomType,
      qty:          r.qty,
      unit_price:   r.unit_price,
      room_numbers: r.room_numbers ?? [],
      evening_rooms: (r.evening_rooms ?? []).filter((n) => (r.room_numbers ?? []).includes(n)),
    }))
    if (roomRows.length > 0) {
      const { error: insErr } = await supabase.from('quote_rooms').insert(roomRows)
      if (insErr) {
        if (oldRooms?.length) {
          await supabase.from('quote_rooms').insert(
            (oldRooms as any[]).map((r) => ({ ...r, quote_id: id })),
          )
        }
        return { success: false, error: `Could not save rooms — the quote's rooms were left unchanged: ${insErr.message}` }
      }
    }

    if (validated.package_type === 'group') {
      const dayErr = await replaceGroupDays(supabase as any, 'quote', id, validated.days as GroupSegment[])  // eslint-disable-line @typescript-eslint/no-explicit-any
      if (dayErr) return { success: false, error: dayErr }
    } else {
      // Switching a group quote back to an ordinary package drops its itinerary.
      await (supabase as any).from('quote_days').delete().eq('quote_id', id)  // eslint-disable-line @typescript-eslint/no-explicit-any
    }

    await supabase.from('history_log').insert({
      entity_type: 'quote',
      entity_id:   id,
      event:       'edited',
      actor:       'system',
      payload:     { customer_name: validated.customer_name },
    })

    revalidatePath('/quotes')
    revalidatePath(`/quotes/${id}`)
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err?.message ?? String(err) }
  }
}

/** Update an existing quote status */
export async function updateQuoteStatus(
  id: string,
  status: BookingStatus,
): Promise<ActionResult> {
  await requirePermission('bookings', 'write')
  try {
    const supabase = createClient()

    const { data: current } = await supabase
      .from('quotes')
      .select('status, converted_to_booking_id')
      .eq('id', id)
      .single()

    if (!current) return { success: false, error: 'Quote not found' }
    // A converted quote's status is owned by its booking — flipping it here
    // would desync the two (and could double-block inventory via the
    // confirmed-unconverted capacity rule).
    if (current.converted_to_booking_id) {
      return { success: false, error: 'This quote was converted to a booking — manage the booking instead.' }
    }
    if (current.status === status) return { success: true }

    const { error } = await supabase
      .from('quotes')
      .update({ status })
      .eq('id', id)

    if (error) return { success: false, error: error.message }

    await supabase.from('history_log').insert({
      entity_type: 'quote',
      entity_id:   id,
      event:       'status_changed',
      actor:       'system',
      payload:     { from: current?.status, to: status },
    })

    revalidatePath('/quotes')
    revalidatePath(`/quotes/${id}`)
    return { success: true }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

/** Update advance payment on a quote */
export async function updateQuoteAdvance(
  id: string,
  advance_paid: number,
  advance_required: number,
): Promise<ActionResult> {
  await requirePermission('bookings', 'write')
  try {
    const supabase = createClient()
    const { error } = await supabase
      .from('quotes')
      .update({ advance_paid, advance_required })
      .eq('id', id)

    if (error) return { success: false, error: error.message }

    await supabase.from('history_log').insert({
      entity_type: 'quote',
      entity_id:   id,
      event:       'edited',
      actor:       'system',
      payload:     { field: 'advance', advance_paid, advance_required },
    })

    revalidatePath(`/quotes/${id}`)
    return { success: true }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

/** Delete a draft quote */
export async function deleteQuote(id: string): Promise<ActionResult> {
  await requirePermission('bookings', 'write')
  try {
    const supabase = createClient()

    const { data: quote } = await supabase
      .from('quotes')
      .select('status')
      .eq('id', id)
      .single()

    if (quote?.status !== 'draft') {
      return { success: false, error: 'Only draft quotes can be deleted' }
    }

    const { error } = await supabase.from('quotes').delete().eq('id', id)
    if (error) return { success: false, error: error.message }

    revalidatePath('/quotes')
    return { success: true }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}


// ─── Snapshots ────────────────────────────────────────────────────────────────

/**
 * Freeze the package(s) a quote prices from. An ordinary quote has one; a
 * group prices its nights from `package_id` and its day guests from
 * `day_package_id`. A group with no nights may name only a day package, in
 * which case that is the primary snapshot too.
 */
async function loadSnapshots(
  supabase: any,   // eslint-disable-line @typescript-eslint/no-explicit-any
  v: { package_id: string; package_type: string; day_package_id?: string | null; days: Array<{ stay_kind: string }> },
): Promise<
  | { snapshot: PackageSnapshot; daySnapshot: PackageSnapshot | null; hasNight: boolean; hasDay: boolean }
  | { error: string }
> {
  const isGroup  = v.package_type === 'group'
  const hasNight = isGroup ? v.days.some((d) => d.stay_kind === 'night')   : v.package_type === 'night'
  const hasDay   = isGroup ? v.days.some((d) => d.stay_kind === 'daylong') : v.package_type === 'daylong'

  const load = async (id: string): Promise<PackageSnapshot | null> => {
    const { data: pkg } = await supabase.from('packages').select('*').eq('id', id).single()
    if (!pkg) return null
    const { data: prices } = await supabase.from('package_room_prices').select('*').eq('package_id', id)
    return buildPackageSnapshot(pkg, prices ?? [])
  }

  const primaryId = v.package_id || v.day_package_id
  if (!primaryId) return { error: 'Package not found' }
  const snapshot = await load(primaryId)
  if (!snapshot) return { error: 'Package not found' }

  let daySnapshot: PackageSnapshot | null = null
  if (isGroup && hasDay) {
    if (v.day_package_id && v.day_package_id !== primaryId) {
      daySnapshot = await load(v.day_package_id)
      if (!daySnapshot) return { error: 'Daylong package not found' }
    } else if (!hasNight) {
      daySnapshot = snapshot   // day-only group: the primary IS the day package
    } else {
      return { error: 'Pick a daylong package to price the day guests' }
    }
  }
  return { snapshot, daySnapshot, hasNight, hasDay }
}
