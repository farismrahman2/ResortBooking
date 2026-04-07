'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { generateBookingNumber } from '@/lib/utils'
import { calculateDaylong, calculateNight } from '@/lib/engine/calculator'
import { getHolidayDateStrings } from '@/lib/queries/settings'
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
