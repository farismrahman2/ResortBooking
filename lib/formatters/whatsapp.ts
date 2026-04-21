/**
 * WhatsApp TEXT GENERATOR
 *
 * Generates copy-paste-ready WhatsApp text for quotes and bookings.
 * Uses the ━━━━━ separator style.
 */

import { formatBDT } from './currency'
import { formatDate, formatDateRange } from './dates'

const SEP = '━━━━━━━━━━━━━━━━━━'

export interface WhatsAppParams {
  type:                'quotation' | 'booking_confirmation'
  referenceNumber:     string        // Quote or booking number
  packageName:         string
  customerName:        string
  customerPhone:       string
  packageType:         'daylong' | 'night'
  visitDate:           string        // ISO date
  checkOutDate:        string | null
  checkIn:             string        // HH:MM
  checkOut:            string        // HH:MM
  rooms: {
    display_name: string
    qty:          number
    unit_price:   number
    nights:       number | null
  }[]
  adults:              number
  childrenPaid:        number
  childrenFree:        number
  drivers:             number
  lineItems: {
    label:      string
    qty:        number
    unit_price: number
    nights:     number | null
    subtotal:   number
  }[]
  subtotal:            number
  discount:            number
  total:               number
  advanceRequired:     number
  advancePaid:         number
  remaining:           number
  mealsText:              string | null
  notesText:              string | null
  contactNumbers:         string
  paymentInstructions:    string
  footerText:             string
  roomAvailableAfterNoon?: boolean  // true when room has a night stay checking out on visit date
}

export function formatWhatsApp(p: WhatsAppParams): string {
  const isBooking = p.type === 'booking_confirmation'
  const typeLabel = isBooking ? 'BOOKING CONFIRMATION' : 'QUOTATION'
  const refLabel  = isBooking ? `#${p.referenceNumber}` : `#${p.referenceNumber}`

  // Date line
  let dateLine: string
  if (p.packageType === 'night' && p.checkOutDate) {
    dateLine = formatDateRange(p.visitDate, p.checkOutDate)
  } else {
    dateLine = formatDate(p.visitDate)
  }

  // Split rooms into paid and complimentary
  const paidRooms = p.rooms.filter((r) => r.qty > 0 && r.unit_price > 0)
  const compRooms = p.rooms.filter((r) => r.qty > 0 && r.unit_price === 0)

  // Paid room lines
  const roomLines = paidRooms
    .map((r) => {
      const base = `${r.display_name} × ${r.qty}: ${formatBDT(r.unit_price)}/room`
      return r.nights ? `${base} × ${r.nights} nights = ${formatBDT(r.qty * r.unit_price * r.nights)}` : `${base} = ${formatBDT(r.qty * r.unit_price)}`
    })
    .join('\n')

  // Complimentary room lines
  const compRoomLines = compRooms
    .map((r) => `${r.display_name} × ${r.qty}: Complimentary`)
    .join('\n')

  // Guest summary
  const guestParts: string[] = []
  if (p.adults > 0) guestParts.push(`Adults: ${p.adults}`)
  if (p.childrenPaid > 0) guestParts.push(`Children (paid, 4–9): ${p.childrenPaid}`)
  if (p.childrenFree > 0) guestParts.push(`Children (free, <3): ${p.childrenFree}`)
  if (p.drivers > 0) guestParts.push(`Drivers: ${p.drivers}`)

  // Pricing line items
  const pricingLines = p.lineItems
    .map((item) => {
      const nightSuffix = item.nights ? ` × ${item.nights}N` : ''
      const right = formatBDT(item.subtotal).padStart(10)
      return `  ${item.label}${nightSuffix}: ${right}`
    })
    .join('\n')

  // Build the output
  const lines: string[] = [
    SEP,
    `🌿 *GARDEN CENTRE RESORT*`,
    `✨ *${typeLabel}* ${refLabel}`,
    SEP,
    `📌 *Package:* ${p.packageName}`,
    `👤 *Name:* ${p.customerName}`,
    `📞 *Contact:* ${p.customerPhone}`,
    `📅 *Date:* ${dateLine}`,
    `🕐 *Check-in:* ${p.checkIn}  |  *Check-out:* ${p.checkOut}`,
    SEP,
    `🏨 *ROOMS*`,
    roomLines || (compRooms.length > 0 ? '  (no paid rooms)' : '  (no rooms selected)'),
    ...(compRooms.length > 0 ? [``, `🎁 *COMPLIMENTARY ROOMS*`, compRoomLines] : []),
    ...(p.roomAvailableAfterNoon ? [`⚠️ *Note:* Room will be available after 12:00 PM (previous guest checking out)`] : []),
    SEP,
    `👥 *GUESTS*`,
    guestParts.join('  |  ') || 'N/A',
    SEP,
    `💰 *PRICING BREAKDOWN*`,
    pricingLines,
    `─────────────────────`,
    `  Subtotal:          ${formatBDT(p.subtotal).padStart(10)}`,
  ]

  if (p.discount > 0) {
    lines.push(`  Discount:         -${formatBDT(p.discount).padStart(9)}`)
  }

  lines.push(
    `  *Total:*           ${formatBDT(p.total).padStart(10)}`,
    `  Advance Required: ${formatBDT(p.advanceRequired).padStart(10)}`,
    `  Advance Paid:     ${formatBDT(p.advancePaid).padStart(10)}`,
    `  *Remaining:*       ${formatBDT(p.remaining).padStart(10)}`,
  )

  if (p.mealsText) {
    lines.push(SEP, `🍽️ *MEALS*`, p.mealsText)
  }

  if (p.notesText) {
    lines.push(SEP, `📝 *NOTES*`, p.notesText)
  }

  lines.push(
    SEP,
    `💳 *PAYMENT*`,
    p.paymentInstructions,
    SEP,
    `📞 ${p.contactNumbers}`,
    p.footerText,
    SEP,
  )

  return lines.join('\n')
}
