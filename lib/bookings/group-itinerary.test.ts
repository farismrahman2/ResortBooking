import { describe, it, expect } from 'vitest'
import {
  deriveGroupHeader, presenceByDate, expandGroupForOps, roomNumbersOnDate,
  roomsRequestedOnDate, rowsToSegments, sortSegments, type GroupSegment,
} from './group-itinerary'

/**
 * The itinerary that prompted the feature: 30 arrive on the 4th, two of them
 * keep Room 101 for three nights, 28 stay on for the day on the 5th and are
 * joined by 4 more, and three rooms are lent to the day guests for free.
 */
const room = (room_type: string, room_numbers: string[], unit_price = 5000) =>
  ({ room_type, qty: room_numbers.length, unit_price, room_numbers })

const ITINERARY: GroupSegment[] = [
  { day_date: '2026-10-05', stay_kind: 'daylong', adults: 32, adults_comp: 28, children_paid: 0, children_free: 0, drivers: 0, extra_beds: 0,
    rooms: [room('deluxe', ['202', '205'], 0), room('superior_deluxe', ['203'], 0)] },
  { day_date: '2026-10-04', stay_kind: 'night', adults: 30, adults_comp: 0, children_paid: 0, children_free: 0, drivers: 2, extra_beds: 0,
    rooms: [
      room('super_premium', ['101'], 12000), room('premium', ['102']), room('premium_deluxe', ['108']),
      room('deluxe', ['202', '205']), room('superior_deluxe', ['203', '206']),
    ] },
  { day_date: '2026-10-06', stay_kind: 'night', adults: 2, adults_comp: 0, children_paid: 0, children_free: 0, drivers: 0, extra_beds: 0,
    rooms: [room('super_premium', ['101'], 12000)] },
  { day_date: '2026-10-05', stay_kind: 'night', adults: 2, adults_comp: 0, children_paid: 0, children_free: 0, drivers: 0, extra_beds: 0,
    rooms: [room('super_premium', ['101'], 12000)] },
]

describe('sortSegments', () => {
  it('orders by date, night before day on the same date', () => {
    const order = sortSegments(ITINERARY).map((s) => `${s.day_date}:${s.stay_kind}`)
    expect(order).toEqual(['2026-10-04:night', '2026-10-05:night', '2026-10-05:daylong', '2026-10-06:night'])
  })
})

describe('deriveGroupHeader', () => {
  it('spans from the first date to the morning after the last night', () => {
    const h = deriveGroupHeader(ITINERARY)!
    expect(h.visit_date).toBe('2026-10-04')
    expect(h.check_out_date).toBe('2026-10-07')
    expect(h.nights).toBe(3)
    expect(h.days).toBe(3)
  })

  it('reports the PEAK headcount, never a sum across days', () => {
    const h = deriveGroupHeader(ITINERARY)!
    // 5 Oct: 2 overnight + 32 day = 34. A sum would say 66.
    expect(h.adults).toBe(34)
    expect(h.drivers).toBe(0)   // the 2 drivers were on the 4th, a smaller day
  })

  it('ends on the last day itself when the itinerary finishes with day guests', () => {
    const h = deriveGroupHeader([
      { day_date: '2026-11-01', stay_kind: 'night',   adults: 10, adults_comp: 0, children_paid: 0, children_free: 0, drivers: 0, extra_beds: 0, rooms: [room('deluxe', ['202'])] },
      { day_date: '2026-11-02', stay_kind: 'daylong', adults: 40, adults_comp: 0, children_paid: 0, children_free: 0, drivers: 0, extra_beds: 0, rooms: [] },
      { day_date: '2026-11-03', stay_kind: 'daylong', adults: 40, adults_comp: 0, children_paid: 0, children_free: 0, drivers: 0, extra_beds: 0, rooms: [] },
    ])!
    expect(h.check_out_date).toBe('2026-11-03')
  })

  it('has no check-out date for a single day of day guests', () => {
    const h = deriveGroupHeader([
      { day_date: '2026-11-02', stay_kind: 'daylong', adults: 40, adults_comp: 0, children_paid: 0, children_free: 0, drivers: 0, extra_beds: 0, rooms: [] },
    ])!
    expect(h.visit_date).toBe('2026-11-02')
    expect(h.check_out_date).toBeNull()
  })

  it('returns null for an empty itinerary', () => {
    expect(deriveGroupHeader([])).toBeNull()
  })
})

describe('presenceByDate', () => {
  it('matches the group\'s own day-by-day table', () => {
    const p = presenceByDate(ITINERARY)
    expect(p.map((d) => [d.date, d.overnight, d.day, d.guests])).toEqual([
      ['2026-10-04', 30, 0, 30],
      ['2026-10-05', 2, 32, 34],
      ['2026-10-06', 2, 0, 2],
    ])
  })

  it('counts rooms per date across both kinds', () => {
    const p = presenceByDate(ITINERARY)
    expect(p.find((d) => d.date === '2026-10-05')!.rooms).toBe(4)   // 101 + 202, 205, 203
  })
})

describe('expandGroupForOps', () => {
  it('turns each segment into the booking shape the meals engine expects', () => {
    const ops = expandGroupForOps(ITINERARY, { includes_dinner: true }, { includes_snacks: true })
    expect(ops.map((b) => `${b.package_type}:${b.visit_date}→${b.check_out_date}`)).toEqual([
      'night:2026-10-04→2026-10-05',
      'night:2026-10-05→2026-10-06',
      'daylong:2026-10-05→null',
      'night:2026-10-06→2026-10-07',
    ])
  })

  it('gives night segments the night package flags and day segments the day flags', () => {
    const ops = expandGroupForOps(ITINERARY, { includes_dinner: true, includes_snacks: false }, { includes_snacks: true, includes_dinner: false })
    const night = ops.find((b) => b.package_type === 'night')!
    const day   = ops.find((b) => b.package_type === 'daylong')!
    expect(night.includes_dinner).toBe(true)
    expect(day.includes_snacks).toBe(true)
    expect(day.includes_dinner).toBe(false)
  })
})

describe('rooms on a date', () => {
  it('lists every room number used that day across both kinds', () => {
    expect(roomNumbersOnDate(ITINERARY, '2026-10-05').sort()).toEqual(['101', '202', '203', '205'])
  })

  it('sums requested rooms per type on a date', () => {
    expect(roomsRequestedOnDate(ITINERARY, '2026-10-05')).toEqual(expect.arrayContaining([
      { room_type: 'super_premium', qty: 1 },
      { room_type: 'deluxe', qty: 2 },
      { room_type: 'superior_deluxe', qty: 1 },
    ]))
  })
})

describe('rowsToSegments', () => {
  it('normalises nullable database rows and sorts them', () => {
    const segs = rowsToSegments([
      { day_date: '2026-10-05', stay_kind: 'daylong', adults: 32, adults_comp: 28, children_paid: null, children_free: null, drivers: null,
        rooms: [{ room_type: 'deluxe', qty: 2, unit_price: null, room_numbers: null }] },
      { day_date: '2026-10-04', stay_kind: 'night', adults: 30, children_paid: 0, children_free: 0, drivers: 2, rooms: [] },
    ])
    expect(segs[0].day_date).toBe('2026-10-04')
    expect(segs[1].rooms[0]).toEqual({ room_type: 'deluxe', qty: 2, unit_price: 0, room_numbers: [], evening_rooms: [] })
    expect(segs[1].children_paid).toBe(0)
  })
})
