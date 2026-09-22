import { describe, expect, it } from 'vitest'
import { itineraryLines } from './whatsapp'
import { itineraryLinesFor } from '@/lib/bookings/itinerary-lines'
import type { GroupSegment } from '@/lib/bookings/group-itinerary'

/**
 * The itinerary block of a group WhatsApp message: room types by count, never
 * by number, and the adult count on every line — a night's bill turns on it.
 */

const seg = (over: Partial<GroupSegment>): GroupSegment => ({
  day_date: '2026-10-04', stay_kind: 'night',
  adults: 30, adults_comp: 0, children_paid: 2, children_free: 0, drivers: 2, extra_beds: 0,
  rooms: [
    { room_type: 'super_premium', display_name: 'Super Premium', qty: 1, unit_price: 12000, room_numbers: ['101'], evening_rooms: [] },
    { room_type: 'deluxe', display_name: 'Deluxe', qty: 2, unit_price: 6000, room_numbers: ['301', '302'], evening_rooms: ['302'] },
    { room_type: 'cottage', display_name: 'Cottage', qty: 1, unit_price: 0, room_numbers: ['104'], evening_rooms: [] },
  ],
  notes: null,
  ...over,
})

const text = (segments: GroupSegment[]) => itineraryLines(itineraryLinesFor(segments, '7:00 PM')).join('\n')

describe('group itinerary in the WhatsApp message', () => {
  it('names no room number', () => {
    const t = text([seg({})])
    for (const num of ['101', '301', '302', '104']) expect(t).not.toMatch(new RegExp(`\\b${num}\\b`))
    expect(t).toContain('Super Premium ×1')
    expect(t).toContain('Deluxe ×2 (1 from 7:00 PM)')
    expect(t).toContain('Complimentary: Cottage ×1')
  })

  it('states adults on a night, children separately', () => {
    expect(text([seg({})])).toContain('🛏 Overnight: 30 adults, 2 children · 2 drivers')
    expect(text([seg({ children_paid: 0, drivers: 0 })])).toContain('🛏 Overnight: 30 adults')
  })

  it('does the same for day guests', () => {
    expect(text([seg({ stay_kind: 'daylong', day_date: '2026-10-05', adults: 32, adults_comp: 28, children_paid: 0, drivers: 0 })]))
      .toContain('☀️ Day guests: 32 adults (28 continuing, not charged)')
  })
})
