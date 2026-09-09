import { describe, expect, it } from 'vitest'
import {
  internalHandoverTime, guestHandoverTime,
  internalHandoverLabel, guestHandoverLabel,
} from './handover'
import { itineraryLinesFor } from '@/lib/bookings/itinerary-lines'
import type { GroupSegment } from '@/lib/bookings/group-itinerary'

describe('evening handover times', () => {
  it('defaults to 6 PM internally and 7 PM for the guest', () => {
    expect(internalHandoverTime({})).toBe('18:00')
    expect(guestHandoverTime({})).toBe('19:00')
    expect(internalHandoverLabel({})).toBe('6:00 PM')
    expect(guestHandoverLabel({})).toBe('7:00 PM')
  })

  it('takes each time from its own setting', () => {
    const settings = { evening_handover_time: '17:30', evening_handover_guest_time: '18:30' }
    expect(internalHandoverLabel(settings)).toBe('5:30 PM')
    expect(guestHandoverLabel(settings)).toBe('6:30 PM')
  })

  it('a guest time of its own does not move the internal one', () => {
    const settings = { evening_handover_guest_time: '20:00' }
    expect(internalHandoverLabel(settings)).toBe('6:00 PM')
    expect(guestHandoverLabel(settings)).toBe('8:00 PM')
  })
})

describe('the itinerary line the guest reads', () => {
  const segment: GroupSegment = {
    day_date: '2026-09-09',
    stay_kind: 'night',
    adults: 5, children_paid: 0, children_free: 0, drivers: 0, adults_comp: 0, extra_beds: 0,
    rooms: [{ room_type: 'deluxe', qty: 2, unit_price: 10000, room_numbers: ['301', '302'], evening_rooms: ['301', '302'] }],
    notes: null,
  }

  it('quotes the guest handover time, not the internal one', () => {
    const lines = itineraryLinesFor([segment], guestHandoverLabel({}))
    const roomLine = lines.flatMap((l) => l.rooms).join(' ')
    expect(roomLine).toContain('from 7:00 PM')
    expect(roomLine).not.toContain('6:00 PM')
  })
})
