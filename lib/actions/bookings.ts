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

type SwapInput =
  | { mode: 'reassign'; room_type: RoomType; new_room_numbers: string[] }
  | {
      mode: 'swap'
      target_booking_id: string
      source_gives: { room_type: RoomType; room_numbers: string[] }
      target_gives: { room_type: RoomType; room_numbers: string[] }
    }
  | {
      mode: 'type_change'
      from_room_type: RoomType
      to_room_type:   RoomType
      qty:            number
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

    // ── Mode: Reassign room numbers (same type) ──────────────────────────────
    if (input.mode === 'reassign') {
      const roomRow = bookingRooms.find((r) => r.room_type === input.room_type)
      if (!roomRow) return { success: false, error: `No ${input.room_type} rooms in this booking` }

      // Validate room numbers belong to this type
      const validNums = ROOM_NUMBERS[input.room_type] ?? []
      for (const num of input.new_room_numbers) {
        if (!validNums.includes(num)) {
          return { success: false, error: `Room ${num} is not a valid ${input.room_type} room` }
        }
      }

      // Check not taken by other bookings
      const taken = await getBookedRoomNumbers(booking.visit_date, booking.check_out_date, bookingId)
      for (const num of input.new_room_numbers) {
        if (taken.includes(num)) {
          return { success: false, error: `Room ${num} is already booked by another booking on these dates` }
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
          room_type:        input.room_type,
          old_room_numbers: roomRow.room_numbers,
          new_room_numbers: input.new_room_numbers,
        },
      })

      revalidatePath(`/bookings/${bookingId}`)
      return { success: true }
    }

    // ── Mode: Swap between two bookings ──────────────────────────────────────
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

      const sourceRow = bookingRooms.find((r) => r.room_type === input.source_gives.room_type)
      const targetRow = targetBookingRooms.find((r) => r.room_type === input.target_gives.room_type)

      if (!sourceRow) return { success: false, error: `Source booking has no ${input.source_gives.room_type} rooms` }
      if (!targetRow) return { success: false, error: `Target booking has no ${input.target_gives.room_type} rooms` }

      for (const num of input.source_gives.room_numbers) {
        if (!(sourceRow.room_numbers ?? []).includes(num)) {
          return { success: false, error: `Room ${num} is not assigned to the source booking` }
        }
      }
      for (const num of input.target_gives.room_numbers) {
        if (!(targetRow.room_numbers ?? []).includes(num)) {
          return { success: false, error: `Room ${num} is not assigned to the target booking` }
        }
      }

      // Perform swap
      const newSourceNums = [
        ...(sourceRow.room_numbers ?? []).filter((n: string) => !input.source_gives.room_numbers.includes(n)),
        ...input.target_gives.room_numbers,
      ]
      const newTargetNums = [
        ...(targetRow.room_numbers ?? []).filter((n: string) => !input.target_gives.room_numbers.includes(n)),
        ...input.source_gives.room_numbers,
      ]

      await db.from('booking_rooms').update({ room_numbers: newSourceNums }).eq('id', sourceRow.id)
      await db.from('booking_rooms').update({ room_numbers: newTargetNums }).eq('id', targetRow.id)

      const swapPayload = (perspective: 'source' | 'target') => ({
        action:   'rooms_swapped',
        mode:     'swap',
        swapped_with: perspective === 'source' ? targetBooking.booking_number : booking.booking_number,
        gave:     perspective === 'source' ? input.source_gives : input.target_gives,
        received: perspective === 'source' ? input.target_gives : input.source_gives,
      })

      await db.from('history_log').insert([
        { entity_type: 'booking', entity_id: bookingId, event: 'edited', actor: 'system', payload: swapPayload('source') },
        { entity_type: 'booking', entity_id: input.target_booking_id, event: 'edited', actor: 'system', payload: swapPayload('target') },
      ])

      revalidatePath(`/bookings/${bookingId}`)
      revalidatePath(`/bookings/${input.target_booking_id}`)
      return { success: true }
    }

    // ── Mode: Change room type (upgrade/downgrade) ───────────────────────────
    if (input.mode === 'type_change') {
      const snap = booking.package_snapshot
      const newPrice = (snap.room_prices as Record<string, number>)[input.to_room_type]
      if (newPrice === undefined) {
        return { success: false, error: `${input.to_room_type.replace(/_/g, ' ')} is not available in this package` }
      }

      const conflict = await checkAvailabilityConflict(
        booking.visit_date,
        booking.check_out_date,
        [{ room_type: input.to_room_type, qty: input.qty }],
        bookingId,
      )
      if (conflict) return { success: false, error: `Availability conflict: ${conflict}` }

      if (input.new_room_numbers.length > 0) {
        const validNums = ROOM_NUMBERS[input.to_room_type] ?? []
        for (const num of input.new_room_numbers) {
          if (!validNums.includes(num)) {
            return { success: false, error: `Room ${num} is not a valid ${input.to_room_type} room` }
          }
        }
        const taken = await getBookedRoomNumbers(booking.visit_date, booking.check_out_date, bookingId)
        for (const num of input.new_room_numbers) {
          if (taken.includes(num)) {
            return { success: false, error: `Room ${num} is already booked on these dates` }
          }
        }
      }

      const oldRow = bookingRooms.find((r) => r.room_type === input.from_room_type)
      if (!oldRow) return { success: false, error: `No ${input.from_room_type} rooms in this booking` }

      const oldQtyRemaining = oldRow.qty - input.qty
      if (oldQtyRemaining < 0) return { success: false, error: 'Cannot change more rooms than available in this type' }

      if (oldQtyRemaining > 0) {
        const keptNums = (oldRow.room_numbers ?? []).slice(0, oldQtyRemaining)
        await db.from('booking_rooms').update({ qty: oldQtyRemaining, room_numbers: keptNums }).eq('id', oldRow.id)
      } else {
        await db.from('booking_rooms').delete().eq('id', oldRow.id)
      }

      const existingNewRow = bookingRooms.find((r) => r.room_type === input.to_room_type)
      if (existingNewRow) {
        const mergedNums = [...(existingNewRow.room_numbers ?? []), ...input.new_room_numbers]
        await db.from('booking_rooms').update({
          qty:          existingNewRow.qty + input.qty,
          unit_price:   newPrice,
          room_numbers: mergedNums,
        }).eq('id', existingNewRow.id)
      } else {
        await db.from('booking_rooms').insert({
          booking_id:   bookingId,
          room_type:    input.to_room_type,
          qty:          input.qty,
          unit_price:   newPrice,
          room_numbers: input.new_room_numbers,
        })
      }

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
          action:         'rooms_swapped',
          mode:           'type_change',
          from_room_type: input.from_room_type,
          to_room_type:   input.to_room_type,
          qty:            input.qty,
          old_total:      booking.total,
          new_total:      calc.total,
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
