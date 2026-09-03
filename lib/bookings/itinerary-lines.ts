/**
 * Itinerary segments → human lines for WhatsApp, print and detail cards.
 * Client-safe.
 */
import { sortSegments, shortDayLabel, type GroupSegment } from './group-itinerary'
import type { ItineraryLine } from '@/lib/formatters/whatsapp'

export function roomTypeLabel(t: string): string {
  return t.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

/** "Super Premium 101", or "Deluxe ×2" when no numbers are assigned; rooms
 *  handed over in the evening are called out — "Deluxe 202, 301 (301 from 6 PM)". */
export function describeRoom(
  r: { room_type: string; display_name?: string; qty: number; room_numbers: string[]; evening_rooms?: string[] },
  handoverLabel = '6 PM',
): string {
  const name = r.display_name ?? roomTypeLabel(r.room_type)
  if (!r.room_numbers.length) return `${name} ×${r.qty}`
  const evening = (r.evening_rooms ?? []).filter((n) => r.room_numbers.includes(n))
  const base = `${name} ${r.room_numbers.join(', ')}`
  return evening.length ? `${base} (${evening.join(', ')} from ${handoverLabel})` : base
}

export function itineraryLinesFor(segments: GroupSegment[], handoverLabel = '6 PM'): ItineraryLine[] {
  return sortSegments(segments).map((s) => ({
    dateLabel:  shortDayLabel(s.day_date),
    kind:       s.stay_kind,
    guests:     s.adults + s.children_paid + s.children_free,
    adultsComp: s.adults_comp,
    drivers:    s.drivers,
    rooms:      s.rooms.filter((r) => r.unit_price > 0).map((r) => describeRoom(r, handoverLabel)),
    compRooms:  s.rooms.filter((r) => r.unit_price === 0).map((r) => describeRoom(r, handoverLabel)),
    note:       s.notes ?? null,
  }))
}
