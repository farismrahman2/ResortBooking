/**
 * Itinerary segments → human lines for WhatsApp, print and detail cards.
 * Client-safe.
 */
import { sortSegments, shortDayLabel, type GroupSegment } from './group-itinerary'
import type { ItineraryLine } from '@/lib/formatters/whatsapp'

export function roomTypeLabel(t: string): string {
  return t.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

/** "Super Premium 101", or "Deluxe ×2" when no numbers are assigned. */
export function describeRoom(r: { room_type: string; display_name?: string; qty: number; room_numbers: string[] }): string {
  const name = r.display_name ?? roomTypeLabel(r.room_type)
  return r.room_numbers.length ? `${name} ${r.room_numbers.join(', ')}` : `${name} ×${r.qty}`
}

export function itineraryLinesFor(segments: GroupSegment[]): ItineraryLine[] {
  return sortSegments(segments).map((s) => ({
    dateLabel:  shortDayLabel(s.day_date),
    kind:       s.stay_kind,
    guests:     s.adults + s.children_paid + s.children_free,
    adultsComp: s.adults_comp,
    drivers:    s.drivers,
    rooms:      s.rooms.filter((r) => r.unit_price > 0).map(describeRoom),
    compRooms:  s.rooms.filter((r) => r.unit_price === 0).map(describeRoom),
    note:       s.notes ?? null,
  }))
}
