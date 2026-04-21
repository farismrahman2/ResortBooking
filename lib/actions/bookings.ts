'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { generateBookingNumber } from '@/lib/utils'
import { calculateDaylong, calculateNight } from '@/lib/engine/calculator'
import { getHolidayDateStrings } from '@/lib/queries/settings'
import { checkAvailabilityConflict, getBookedRoomNumbers } from '@/lib/queries/availability'
import { ROOM_NUMBERS } from '@/lib/config/rooms'
import type { ActionResult, ActionData } from './types'
import type { RoomType, PackageType, PackageSnapshot } from '@/lib/supabase/types'

/** Convert a confirmed quote into a booking */
export async function convertQuoteToBooking(
  quoteId: string,
): Promise<ActionData<{ bookingId: string; bookingNumber: string }>> {
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

    const { data: quoteRooms } = await db
      .from('quote_rooms')
      .select('*')
      .eq('quote_id', quoteId)

    // Generate booking number
    const booking_number = await generateBookingNumber(supabase as any)

    // Insert booking (mirror of quote)
    const { data: booking, error: bErr } = await db
      .from('bookings')
      .insert({
        booking_number,
        quote_id:         quote.id,
        customer_name:    quote.customer_name,
        customer_phone:   quote.customer_phone,
        customer_notes:   quote.customer_notes,
        package_type:     quote.package_type,
        visit_date:       quote.visit_date,
        check_out_date:   quote.check_out_date,
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
        status:              'confirmed',
        package_snapshot: quote.package_snapshot,
        line_items:       quote.line_items,
        extra_items:      quote.extra_items ?? [],
      })
      .select('id, booking_number')
      .single()

    if (bErr || !booking) return { success: false, error: bErr?.message ?? 'Booking insert failed' }

    // Copy quote rooms → booking rooms (including any pre-assigned room numbers)
    if (quoteRooms?.length) {
      await db.from('booking_rooms').insert(
        quoteRooms.map((r: any) => ({
          booking_id:   booking.id,
          room_type:    r.room_type as RoomType,
          qty:          r.qty,
          unit_price:   r.unit_price,
          room_numbers: r.room_numbers ?? [],
        })),
      )
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
): Promise<ActionResult> {
  try {
    const supabase = createClient()
    const { error } = await supabase
      .from('bookings')
      .update({ advance_paid, advance_required })
      .eq('id', bookingId)

    if (error) return { success: false, error: error.message }

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

/** Cancel a booking */
export async function cancelBooking(bookingId: string): Promise<ActionResult> {
  try {
    const supabase = createClient()
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
      payload:     { from: 'confirmed', to: 'cancelled' },
    })

    revalidatePath('/bookings')
    revalidatePath(`/bookings/${bookingId}`)
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
    rooms: { room_type: RoomType; display_name: string; qty: number; unit_price: number; room_numbers: string[] }[]
    extra_items: { label: string; qty: number; unit_price: number }[]
    // context for recalculation
    package_type:     PackageType
    visit_date:       string
    check_out_date:   string | null
    package_snapshot: PackageSnapshot
  },
): Promise<ActionResult> {
  try {
    const supabase   = createClient()
    const holidayDates = await getHolidayDateStrings()

    const { rooms, extra_items, package_type, visit_date, check_out_date, package_snapshot, ...guestData } = input

    // Recalculate totals using the frozen snapshot
    let calc
    if (package_type === 'daylong') {
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

    // Update booking record
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
        adults:              input.adults,
        children_paid:       input.children_paid,
        children_free:       input.children_free,
        drivers:             input.drivers,
        extra_beds:          input.extra_beds,
        subtotal:            calc.subtotal,
        line_items:          calc.line_items,
        extra_items,
      })
      .eq('id', bookingId)

    if (bookingErr) return { success: false, error: bookingErr.message }

    // Replace booking rooms
    await supabase.from('booking_rooms').delete().eq('booking_id', bookingId)
    const activeRooms = rooms.filter((r) => r.qty > 0)
    if (activeRooms.length > 0) {
      await supabase.from('booking_rooms').insert(
        activeRooms.map((r) => ({
          booking_id:   bookingId,
          room_type:    r.room_type,
          qty:          r.qty,
          unit_price:   r.unit_price,
          room_numbers: r.room_numbers ?? [],
        })),
      )
    }

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

    // Fetch rooms
    const { data: rooms } = await db
      .from('booking_rooms')
      .select('*')
      .eq('booking_id', bookingId)

    const bookingRooms = (rooms ?? []) as { id: string; room_type: RoomType; qty: number; unit_price: number; room_numbers: string[] }[]

    // Re-check availability (guard against race conditions)
    const requestedRooms = bookingRooms.map((r) => ({ room_type: r.room_type, qty: r.qty }))
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
        .update({ room_numbers: finalNums })
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

      // Check not taken by other bookings (exclude self)
      const taken = await getBookedRoomNumbers(booking.visit_date, booking.check_out_date, bookingId)
      // Also exclude numbers currently on this row (they're being replaced)
      const currentOwn = new Set(roomRow.room_numbers ?? [])
      for (const num of input.new_room_numbers) {
        if (taken.includes(num) && !currentOwn.has(num)) {
          return { success: false, error: `Room ${num} is already booked by another booking on these dates` }
        }
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

      await db.from('booking_rooms').update({ room_numbers: input.new_room_numbers }).eq('id', roomRow.id)

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
        // Re-check taken (exclude self + own row's current numbers)
        const taken = await getBookedRoomNumbers(booking.visit_date, booking.check_out_date, bookingId)
        const ownCurrent = new Set(oldRow.room_numbers ?? [])
        for (const num of input.new_room_numbers) {
          if (taken.includes(num) && !ownCurrent.has(num)) {
            return { success: false, error: `Room ${num} is already booked on these dates` }
          }
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
