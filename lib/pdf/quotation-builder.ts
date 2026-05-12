import type { QuoteWithRooms, BookingWithRooms, SettingsMap, RoomInventoryRow, QuoteRow, BookingRow } from '@/lib/supabase/types'
import { formatDate } from '@/lib/formatters/dates'
import type { QuotationPdfInput } from './quotation'

/**
 * Build PDF input from a quote OR booking row. Reuses the snapshot data
 * that the WhatsApp formatter consumes so the two surfaces stay in sync.
 * The PDF stage is read-only — no caching, no DB writes. Refresh = re-fetch.
 */
export function buildQuotationPdfInput(args: {
  source:  QuoteWithRooms | BookingWithRooms
  kind:    'quotation' | 'booking'
  isDraftPreview?: boolean
  settings:  SettingsMap
  inventory: RoomInventoryRow[]
}): QuotationPdfInput {
  const { source, kind, isDraftPreview, settings, inventory } = args
  const snap: any = source.package_snapshot ?? {}  // eslint-disable-line @typescript-eslint/no-explicit-any
  const isBooking = 'booking_number' in source
  const referenceNumber =
    isBooking ? (source as BookingRow).booking_number : (source as QuoteRow).quote_number

  const visitDate    = formatDate(source.visit_date)
  const checkOutDate = source.check_out_date ? formatDate(source.check_out_date) : null
  const isNight      = source.package_type === 'night'
  const checkIn      = String(snap.check_in ?? '14:00')
  const checkOut     = String(snap.check_out ?? '12:00')
  const dateLine     = isNight && checkOutDate ? `${visitDate} → ${checkOutDate}` : visitDate

  // Map rooms (booking_rooms[] / quote_rooms[]) into display rows. Reuse the
  // inventory to look up display names where the row only has the slug.
  const rooms = (source.rooms ?? []).map((r: any) => {  // eslint-disable-line @typescript-eslint/no-explicit-any
    const inv = inventory.find((i) => i.room_type === r.room_type)
    const unit_price = Number(snap.room_prices?.[r.room_type] ?? 0)
    return {
      display_name: inv?.display_name ?? String(r.room_type).replace(/_/g, ' '),
      qty:          Number(r.qty),
      unit_price,
      nights:       isNight ? Number(source.nights ?? 1) : null,
      room_numbers: r.room_numbers ?? null,
    }
  })

  const lineItems = (source.line_items ?? []).map((li: any) => ({  // eslint-disable-line @typescript-eslint/no-explicit-any
    label:      li.label,
    qty:        Number(li.qty),
    unit_price: Number(li.unit_price),
    nights:     li.nights ? Number(li.nights) : null,
    subtotal:   Number(li.subtotal),
  }))

  const meals = [
    snap.includes_breakfast ? 'Breakfast' : null,
    snap.includes_lunch     ? 'Lunch' : null,
    snap.includes_dinner    ? 'Dinner' : null,
    snap.includes_snacks    ? 'Snacks' : null,
  ].filter(Boolean).join(', ') || null

  return {
    documentType:   kind,
    isDraftPreview,
    referenceNumber,
    customerName:   source.customer_name,
    customerPhone:  source.customer_phone,
    packageName:    String(snap.name ?? 'Package'),
    visitDate:      dateLine,
    checkIn,
    checkOut,
    adults:        Number(source.adults ?? 0),
    childrenPaid:  Number(source.children_paid ?? 0),
    childrenFree:  Number(source.children_free ?? 0),
    drivers:       Number(source.drivers ?? 0),
    rooms,
    lineItems,
    subtotal:        Number(source.subtotal ?? 0),
    discount:        Number(source.discount ?? 0),
    discountPct:     Number(source.discount_pct ?? 0),
    total:           Number(source.total ?? 0),
    advanceRequired: Number(source.advance_required ?? 0),
    advancePaid:     Number(source.advance_paid ?? 0),
    remaining:       Number(source.remaining ?? 0),
    meals,
    notes: source.customer_notes ?? null,
    paymentInstructions: settings.payment_instructions ?? null,
    resortName:    settings.resort_name    ?? 'Garden Centre Resort',
    resortAddress: settings.resort_address ?? 'Kaliganj, Gazipur, Bangladesh',
    resortPhone:   settings.contact_numbers ?? '',
    generatedAt:   new Date(),
  }
}
