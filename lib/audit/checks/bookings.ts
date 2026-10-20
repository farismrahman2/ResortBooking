import { occupancyOnDate, type StayLike } from '@/lib/engine/halves'
import { requiredRoomNumbers } from '@/lib/config/rooms'
import { addDaysIso } from '@/lib/dates'
import { daysBetween, finding, type Finding } from '../types'

export interface AuditBooking {
  id: string; booking_number: string; customer_name: string; customer_phone: string | null
  package_type: string; visit_date: string; check_out_date: string | null; status: string
  subtotal: number; discount: number; total: number; advance_paid: number; remaining: number
  line_items: Array<{ subtotal?: number }> | null; created_at: string
  rooms: Array<{ room_type: string; qty: number; room_numbers: string[]; evening_rooms?: string[] }>
}
export interface AuditQuote { id: string; quote_number: string; customer_name: string; visit_date: string; status: string; converted_to_booking_id: string | null }
export interface AuditPackagePrice { package_id: string; package_name: string; package_type: string; room_type: string; price: number }

const live = (b: AuditBooking) => b.status === 'confirmed' || b.status === 'checked_out'
const bk = (b: AuditBooking, detail: string) => ({ ref: b.booking_number, detail: `${b.customer_name} · ${detail}`, link: `/bookings/${b.id}` })
const taka = (n: number) => `৳${Math.round(n).toLocaleString('en-IN')}`
/** Bangladesh mobile: 01XXXXXXXXX, optionally +88 / 88. */
export const validPhone = (p: string | null) =>
  !!p && p.split(/[/,;]|\bor\b/).some((x) => /^(\+?88)?01[3-9]\d{8}$/.test(x.replace(/[\s-]/g, '')))   // "017… / 018…" is fine

export function checkBookings(input: {
  bookings: AuditBooking[]; quotes: AuditQuote[]; prices: AuditPackagePrice[]; today: string
}): Finding[] {
  const { bookings, quotes, prices, today } = input
  const out: Array<Finding | null> = []

  out.push(finding({ id: 'booking-advance-over-total', area: 'bookings', severity: 'high', title: 'Advance paid is more than the booking total' },
    bookings.filter((b) => live(b) && b.advance_paid > b.total && b.total > 0).map((b) => bk(b, `advance ${taka(b.advance_paid)} > total ${taka(b.total)}`))))

  const mismatched = bookings.filter((b) => {
    if (!live(b) || !Array.isArray(b.line_items) || b.line_items.length === 0) return false
    const sum = b.line_items.reduce((s, l) => s + Number(l.subtotal ?? 0), 0)
    return Math.abs(sum - b.subtotal) > 1
  })
  out.push(finding({ id: 'booking-lines-mismatch', area: 'bookings', severity: 'high', title: 'Bill lines don\'t add up to the booking subtotal' },
    mismatched.map((b) => bk(b, `lines ${taka((b.line_items ?? []).reduce((s, l) => s + Number(l.subtotal ?? 0), 0))} vs subtotal ${taka(b.subtotal)}`))))

  out.push(finding({ id: 'booking-negative-balance', area: 'bookings', severity: 'medium', title: 'Booking with a negative balance (paid more than owed)' },
    bookings.filter((b) => live(b) && b.remaining < 0).map((b) => bk(b, `balance ${taka(b.remaining)}`))))

  // Same room, same half, two bookings — over the next 60 days.
  const horizon = addDaysIso(today, 60)
  const future = bookings.filter((b) => b.status === 'confirmed' && (b.check_out_date ?? b.visit_date) >= today && b.visit_date <= horizon)
  const clashes = new Map<string, string>()
  for (let d = today; d <= horizon; d = addDaysIso(d, 1)) {
    const seen = new Map<string, string>()   // "room|half" → booking number
    for (const b of future) {
      const stay: StayLike = { package_type: b.package_type === 'daylong' ? 'daylong' : 'night', visit_date: b.visit_date, check_out_date: b.check_out_date, rooms: b.rooms }
      for (const rec of occupancyOnDate(stay, d)) for (const n of rec.room_numbers) {
        for (const half of [rec.day ? 'day' : null, rec.night ? 'night' : null]) {
          if (!half) continue
          const key = `${n}|${half}`, prev = seen.get(key)
          if (prev && prev !== b.booking_number) clashes.set(`${d}|${n}`, `${prev} and ${b.booking_number}`)
          else seen.set(key, b.booking_number)
        }
      }
    }
  }
  out.push(finding({ id: 'booking-double-booked', area: 'bookings', severity: 'high', title: 'A room is booked twice for the same time' },
    [...clashes.entries()].map(([k, who]) => { const [d, n] = k.split('|'); return { ref: `Room ${n}`, detail: `${d}: ${who}`, link: `/availability/rooms?date=${d}` } })))

  out.push(finding({ id: 'booking-missing-room-numbers', area: 'bookings', severity: 'medium', title: 'Upcoming booking without room numbers picked' },
    future.filter((b) => b.rooms.some((r) => r.qty > 0 && r.room_numbers.length < requiredRoomNumbers(r.room_type, r.qty)))
      .map((b) => bk(b, `arrives ${b.visit_date}`))))

  out.push(finding({ id: 'booking-not-closed', area: 'bookings', severity: 'medium', title: 'Stay ended in the last 30 days but the booking was never checked out or marked no-show' },
    bookings.filter((b) => { const d = daysBetween(b.check_out_date ?? b.visit_date, today); return b.status === 'confirmed' && d > 2 && d <= 30 })
      .map((b) => bk(b, `ended ${b.check_out_date ?? b.visit_date}`))))

  out.push(finding({ id: 'quote-expired-unconverted', area: 'bookings', severity: 'low', title: 'Confirmed quote whose date has passed — never turned into a booking' },
    quotes.filter((q) => q.status === 'confirmed' && !q.converted_to_booking_id && q.visit_date < today && daysBetween(q.visit_date, today) <= 60)
      .map((q) => ({ ref: q.quote_number, detail: `${q.customer_name} · ${q.visit_date}`, link: `/quotes/${q.id}` }))))

  const recent = bookings.filter((b) => daysBetween(b.created_at, today) <= 30)
  out.push(finding({ id: 'booking-big-discount', area: 'bookings', severity: 'medium', title: 'Large discount (over 20%) given in the last 30 days' },
    recent.filter((b) => live(b) && b.subtotal > 0 && b.discount / b.subtotal > 0.2)
      .map((b) => bk(b, `${Math.round((b.discount / b.subtotal) * 100)}% off (${taka(b.discount)})`)),
    recent.filter((b) => live(b) && b.subtotal > 0 && b.discount / b.subtotal > 0.2).reduce((s, b) => s + b.discount, 0)))

  out.push(finding({ id: 'booking-bad-phone', area: 'bookings', severity: 'low', title: 'Guest phone number looks wrong (new bookings, last 30 days)' },
    recent.filter((b) => !validPhone(b.customer_phone)).map((b) => bk(b, `phone "${b.customer_phone ?? ''}"`))))

  out.push(finding({ id: 'price-zero', area: 'bookings', severity: 'low', title: 'Room priced ৳0 on a package (means complimentary-only — check it\'s intended)' },
    prices.filter((p) => p.price === 0 && p.room_type !== 'conference_room').map((p) => ({ ref: p.package_name, detail: p.room_type.replace(/_/g, ' '), link: '/settings/room-prices' }))))

  return out.filter((f): f is Finding => f !== null)
}
