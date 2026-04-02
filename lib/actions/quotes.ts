'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { CreateQuoteSchema, type CreateQuoteInput } from '@/lib/validators/quote'
import { calculateDaylong, calculateNight } from '@/lib/engine/calculator'
import { buildPackageSnapshot } from '@/lib/engine/snapshot'
import { generateQuoteNumber } from '@/lib/utils'
import { getHolidayDateStrings } from '@/lib/queries/settings'
import type { ActionResult, ActionData } from './types'
import type { BookingStatus, RoomType } from '@/lib/supabase/types'

/**
 * Check if requested rooms are available across every night in [checkIn, checkOut).
 * For daylong, only checks the single visit date.
 * Returns a human-readable conflict message, or null if all clear.
 */
async function checkAvailabilityConflict(
  supabase: ReturnType<typeof createClient>,
  visitDate: string,
  checkOutDate: string | null,
  requestedRooms: { room_type: string; qty: number }[],
): Promise<string | null> {
  // Build list of dates to check
  const dates: string[] = []
  if (!checkOutDate) {
    dates.push(visitDate)
  } else {
    const cur = new Date(visitDate + 'T00:00:00')
    const end = new Date(checkOutDate + 'T00:00:00')
    while (cur < end) {
      dates.push(cur.toISOString().slice(0, 10))
      cur.setDate(cur.getDate() + 1)
    }
  }

  // For each date, fetch occupied rooms and check capacity
  const { data: inventory } = await supabase.from('room_inventory').select('room_type, total_units')

  for (const date of dates) {
    const { data: bookingOccupied } = await supabase
      .from('booking_rooms')
      .select('room_type, qty, bookings!inner(visit_date, check_out_date, status)')
      .filter('bookings.visit_date', 'lte', date)
      .neq('bookings.status', 'cancelled')

    const { data: quoteOccupied } = await supabase
      .from('quote_rooms')
      .select('room_type, qty, quotes!inner(visit_date, check_out_date, status, converted_to_booking_id)')
      .filter('quotes.visit_date', 'lte', date)
      .eq('quotes.status', 'confirmed')
      .is('quotes.converted_to_booking_id', null)  // exclude quotes already converted to bookings

    // Sum already-occupied units per room type on this date
    const occupied = new Map<string, number>()
    for (const row of bookingOccupied ?? []) {
      const b = (row as any).bookings
      const blocks = b.check_out_date ? b.check_out_date > date : b.visit_date === date
      if (blocks) {
        occupied.set(row.room_type, (occupied.get(row.room_type) ?? 0) + row.qty)
      }
    }
    for (const row of quoteOccupied ?? []) {
      const q = (row as any).quotes
      const blocks = q.check_out_date ? q.check_out_date > date : q.visit_date === date
      if (blocks) {
        occupied.set(row.room_type, (occupied.get(row.room_type) ?? 0) + row.qty)
      }
    }

    // Check each requested room
    for (const req of requestedRooms) {
      const totalUnits = (inventory ?? []).find((r: any) => r.room_type === req.room_type)?.total_units ?? 0
      const alreadyBooked = occupied.get(req.room_type) ?? 0
      const available = totalUnits - alreadyBooked
      if (req.qty > available) {
        return `${req.room_type.replace(/_/g, ' ')} is unavailable on ${date} (${available} of ${totalUnits} remaining, ${req.qty} requested)`
      }
    }
  }

  return null
}

/** Create a new quote with full calculation and snapshot */
export async function createQuote(
  input: CreateQuoteInput,
): Promise<ActionData<{ quoteId: string; quoteNumber: string }>> {
  try {
    const validated = CreateQuoteSchema.parse(input)
    const supabase  = createClient()

    // Fetch package + room prices for snapshot
    const { data: pkg } = await supabase
      .from('packages')
      .select('*')
      .eq('id', validated.package_id)
      .single()

    if (!pkg) return { success: false, error: 'Package not found' }

    const { data: roomPrices } = await supabase
      .from('package_room_prices')
      .select('*')
      .eq('package_id', validated.package_id)

    const snapshot = buildPackageSnapshot(pkg, roomPrices ?? [])
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
        service_charge_pct: validated.service_charge_pct ?? 0,
        advance_required:   validated.advance_required,
        advance_paid:       validated.advance_paid,
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
        service_charge_pct: validated.service_charge_pct ?? 0,
        advance_required:   validated.advance_required,
        advance_paid:       validated.advance_paid,
      })
    }

    // Availability pre-check — block if any requested room is over capacity
    const conflict = await checkAvailabilityConflict(
      supabase,
      validated.visit_date,
      validated.check_out_date ?? null,
      validated.rooms.map((r) => ({ room_type: r.room_type, qty: r.qty })),
    )
    if (conflict) return { success: false, error: `Availability conflict: ${conflict}` }

    // Generate unique quote number
    const quote_number = await generateQuoteNumber(supabase as any)

    // Insert quote
    const { data: quote, error: quoteError } = await supabase
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
        service_charge_pct:  validated.service_charge_pct ?? 0,
        advance_required:    calcResult.advance_required,
        advance_paid:        calcResult.advance_paid,
        status:              'draft',
        package_snapshot: snapshot,
        line_items:       calcResult.line_items,
      })
      .select('id, quote_number')
      .single()

    if (quoteError || !quote) return { success: false, error: quoteError?.message ?? 'Insert failed' }

    // Insert quote rooms
    const roomRows = validated.rooms.map((r) => ({
      quote_id:     quote.id,
      room_type:    r.room_type as RoomType,
      qty:          r.qty,
      unit_price:   r.unit_price,
      room_numbers: r.room_numbers ?? [],
    }))

    if (roomRows.length > 0) {
      await supabase.from('quote_rooms').insert(roomRows)
    }

    // Log history
    await supabase.from('history_log').insert({
      entity_type: 'quote',
      entity_id:   quote.id,
      event:       'created',
      actor:       'system',
      payload:     { quote_number, customer_name: validated.customer_name },
    })

    revalidatePath('/quotes')
    return { success: true, data: { quoteId: quote.id, quoteNumber: quote.quote_number } }
  } catch (err: any) {
    return { success: false, error: err?.message ?? String(err) }
  }
}

/** Update an existing quote status */
export async function updateQuoteStatus(
  id: string,
  status: BookingStatus,
): Promise<ActionResult> {
  try {
    const supabase = createClient()

    const { data: current } = await supabase
      .from('quotes')
      .select('status')
      .eq('id', id)
      .single()

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
