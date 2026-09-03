/**
 * WhatsApp TEXT GENERATOR
 *
 * Generates copy-paste-ready WhatsApp text for quotes and bookings.
 * Uses the ━━━━━ separator style.
 */

import { formatBDT } from './currency'
import { formatDate, formatDateRange } from './dates'

const SEP = '━━━━━━━━━━━━━━━━━━'

/** Convert a 24-hour "HH:MM" (or "HH:MM:SS") time to 12-hour "h:MM AM/PM". */
export function to12Hour(time: string): string {
  if (!time) return time
  const [hRaw, mRaw = '00'] = time.split(':')
  let h = parseInt(hRaw, 10)
  if (Number.isNaN(h)) return time
  const minutes = mRaw.padStart(2, '0').slice(0, 2)
  const period = h >= 12 ? 'PM' : 'AM'
  h = h % 12
  if (h === 0) h = 12
  return `${h}:${minutes} ${period}`
}


export interface ItineraryLine {
  dateLabel:  string           // "Sat 4 Oct"
  kind:       'night' | 'daylong'
  guests:     number
  adultsComp: number
  drivers:    number
  rooms:      string[]         // "Super Premium 101", "Deluxe 202, 205"
  compRooms:  string[]
  note?:      string | null
}

export interface WhatsAppParams {
  type:                'quotation' | 'booking_confirmation'
  referenceNumber:     string        // Quote or booking number
  packageName:         string
  customerName:        string
  customerPhone:       string
  packageType:         'daylong' | 'night' | 'group'
  /** Group bookings: the per-day itinerary. Replaces the ROOMS and GUESTS
   *  sections with a day-by-day one. */
  itinerary?:          ItineraryLine[]
  visitDate:           string        // ISO date
  checkOutDate:        string | null
  checkIn:             string        // HH:MM
  checkOut:            string        // HH:MM
  rooms: {
    display_name: string
    qty:          number
    unit_price:   number
    nights:       number | null
    room_numbers?:  string[]
    /** Handed over at the evening handover time on the check-in day. */
    evening_rooms?: string[]
  }[]
  /** HH:MM — when evening-handover rooms are given to the guests. */
  handoverTime?:       string
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
  /** When the discount came from a percentage, show it next to the amount. */
  discountPct?:        number
  total:               number
  advanceRequired:     number
  advancePaid:         number
  remaining:           number
  mealsText:              string | null
  notesText:              string | null
  contactNumbers:         string
  paymentInstructions:    string
  footerText:             string
  salesRepName?:          string | null   // shown at the bottom of booking confirmations
  companyName?:           string | null   // when set, renders a 🏢 Company line above the guest name
  roomAvailableAfterNoon?: boolean  // true when room has a night stay checking out on visit date
}

export function formatWhatsApp(p: WhatsAppParams): string {
  const isBooking = p.type === 'booking_confirmation'
  const typeLabel = isBooking ? 'BOOKING CONFIRMATION' : 'QUOTATION'
  const refLabel  = isBooking ? `#${p.referenceNumber}` : `#${p.referenceNumber}`

  // Date line
  let dateLine: string
  if ((p.packageType === 'night' || p.packageType === 'group') && p.checkOutDate) {
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

  // Which physical rooms, and when the guests get them. Only spelled out when
  // some rooms are handed over in the evening — otherwise the numbers alone
  // would be noise on a message that already lists the room types.
  const eveningNums = p.rooms.flatMap((r) => (r.evening_rooms ?? []).filter((n) => (r.room_numbers ?? []).includes(n)))
  const arrivalNums = p.rooms.flatMap((r) => (r.room_numbers ?? []).filter((n) => !(r.evening_rooms ?? []).includes(n)))
  const handoverLines = eveningNums.length > 0
    ? [
        ``,
        `🔑 *ROOM HANDOVER*`,
        ...(arrivalNums.length ? [`  On arrival: ${arrivalNums.join(', ')}`] : []),
        `  From ${to12Hour(p.handoverTime ?? '18:00')}: ${eveningNums.join(', ')} (after the day's guests leave)`,
      ]
    : []

  // Guest summary
  const guestParts: string[] = []
  if (p.adults > 0) guestParts.push(`Adults: ${p.adults}`)
  if (p.childrenPaid > 0) guestParts.push(`Children (paid, 4–9): ${p.childrenPaid}`)
  if (p.childrenFree > 0) guestParts.push(`Children (free, <3): ${p.childrenFree}`)
  if (p.drivers > 0) guestParts.push(`Drivers: ${p.drivers}`)

  // Pricing line items — show qty × unit_price = subtotal so the
  // recipient can audit the math. Service-charge / single-unit lines
  // (qty=1 unit_price=subtotal) collapse to just the total.
  const pricingLines = p.lineItems
    .map((item) => {
      const nightSuffix = item.nights ? ` × ${item.nights}N` : ''
      const showBreakdown = item.qty > 1 || item.nights
      const right = formatBDT(item.subtotal)
      if (!showBreakdown) {
        return `  ${item.label}: ${right}`
      }
      const factors = `${item.qty} × ${formatBDT(item.unit_price)}${nightSuffix}`
      return `  ${item.label}: ${factors} = ${right}`
    })
    .join('\n')

  // 12.5 → "12.5", 15 → "15" — no trailing ".0" noise in the message.
  const trimPct = (n: number) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10))

  // Build the output
  const lines: string[] = [
    SEP,
    `🌿 *GARDEN CENTRE RESORT*`,
    `✨ *${typeLabel}* ${refLabel}`,
    SEP,
    `📌 *Package:* ${p.packageName}`,
    ...(p.companyName ? [`🏢 *Company:* ${p.companyName}`] : []),
    `👤 *Name:* ${p.customerName}`,
    `📞 *Contact:* ${p.customerPhone}`,
    `📅 *Date:* ${dateLine}`,
    `🕐 *Check-in:* ${to12Hour(p.checkIn)}  |  *Check-out:* ${to12Hour(p.checkOut)}`,
    SEP,
    ...(p.itinerary && p.itinerary.length > 0
      ? [`🗓️ *ITINERARY*`, ...itineraryLines(p.itinerary), SEP]
      : [
          `🏨 *ROOMS*`,
          roomLines || (compRooms.length > 0 ? '  (no paid rooms)' : '  (no rooms selected)'),
          ...(compRooms.length > 0 ? [``, `🎁 *COMPLIMENTARY ROOMS*`, compRoomLines] : []),
          ...handoverLines,
          ...(p.roomAvailableAfterNoon ? [`⚠️ *Note:* Room will be available after 12:00 PM (previous guest checking out)`] : []),
          SEP,
          `👥 *GUESTS*`,
          guestParts.join('  |  ') || 'N/A',
          SEP,
        ]),
    `💰 *PRICING BREAKDOWN*`,
    pricingLines,
    `─────────────────────`,
    `  Subtotal:          ${formatBDT(p.subtotal).padStart(10)}`,
  ]

  if (p.discount > 0) {
    // "Discount (15%): -৳13,913" — the guest should see the rate they were
    // given, not just the amount. Flat discounts keep the plain label.
    const pctLabel = p.discountPct && p.discountPct > 0 ? ` (${trimPct(p.discountPct)}%)` : ''
    const label = `Discount${pctLabel}:`
    lines.push(`  ${label.padEnd(19)}-${formatBDT(p.discount).padStart(9)}`)
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
  )

  // Booking confirmations get a sales-rep attribution line so the guest
  // knows who handled their booking. Quotes skip this — they're often sent
  // before the rep is locked in.
  if (isBooking && p.salesRepName) {
    lines.push(`🤝 *Booking by:* ${p.salesRepName}`)
  }

  lines.push(SEP)

  return lines.join('\n')
}

/** One line per segment, grouped visually by date. */
export function itineraryLines(lines: ItineraryLine[]): string[] {
  const out: string[] = []
  let lastDate = ''
  for (const l of lines) {
    const head = l.dateLabel === lastDate ? '   ' : `📅 *${l.dateLabel}*`
    if (l.dateLabel !== lastDate) out.push(head)
    lastDate = l.dateLabel
    const who = l.kind === 'night' ? '🛏 Overnight' : '☀️ Day guests'
    const comp = l.adultsComp > 0 ? ` (${l.adultsComp} continuing, not charged)` : ''
    const drv  = l.drivers > 0 ? ` · ${l.drivers} driver${l.drivers === 1 ? '' : 's'}` : ''
    out.push(`  ${who}: ${l.guests} guest${l.guests === 1 ? '' : 's'}${comp}${drv}`)
    if (l.rooms.length)     out.push(`    Rooms: ${l.rooms.join(', ')}`)
    if (l.compRooms.length) out.push(`    🎁 Complimentary: ${l.compRooms.join(', ')}`)
    if (l.note)             out.push(`    ${l.note}`)
  }
  return out
}
