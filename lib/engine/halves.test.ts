import { describe, it, expect } from 'vitest'
import {
  occupancyOnDate, findHalvesConflict, availabilityByHalves, roomNumberBuckets, type StayLike,
} from './halves'

/** Four deluxe rooms. A night booking takes 202 and 205 on arrival, 301 and
 *  302 at 6 PM — so 301 and 302 can still be sold for the day. */
const INV = new Map([['deluxe', 4]])
const NIGHT_SPLIT: StayLike = {
  package_type: 'night', visit_date: '2026-10-10', check_out_date: '2026-10-12',
  rooms: [{ room_type: 'deluxe', qty: 4, room_numbers: ['202', '205', '301', '302'], evening_rooms: ['301', '302'] }],
}

describe('occupancyOnDate — the halves table', () => {
  it('check-in day: instant rooms take both halves, 6 PM rooms take the night only', () => {
    const occ = occupancyOnDate(NIGHT_SPLIT, '2026-10-10')
    const evening = occ.find((r) => !r.day)!
    const instant = occ.find((r) => r.day)!
    expect(evening).toMatchObject({ qty: 2, room_numbers: ['301', '302'], day: false, night: true })
    expect(instant).toMatchObject({ qty: 2, room_numbers: ['202', '205'], day: true, night: true })
  })

  it('middle of the stay: every room takes both halves', () => {
    const occ = occupancyOnDate(NIGHT_SPLIT, '2026-10-11')
    expect(occ).toHaveLength(1)
    expect(occ[0]).toMatchObject({ qty: 4, day: true, night: true })
  })

  it('checkout day: nothing (the noon rule)', () => {
    expect(occupancyOnDate(NIGHT_SPLIT, '2026-10-12')).toEqual([])
  })

  it('daylong: the day only', () => {
    const occ = occupancyOnDate({ package_type: 'daylong', visit_date: '2026-10-10', check_out_date: null,
      rooms: [{ room_type: 'deluxe', qty: 1, room_numbers: ['301'] }] }, '2026-10-10')
    expect(occ[0]).toMatchObject({ day: true, night: false })
  })
})

describe('findHalvesConflict — the resort scenario', () => {
  const occ = occupancyOnDate(NIGHT_SPLIT, '2026-10-10')

  it('sells the two 6 PM rooms for the day', () => {
    expect(findHalvesConflict(INV, occ, [{ room_type: 'deluxe', qty: 2, room_numbers: ['301', '302'] }], 'daylong', true, '2026-10-10')).toBeNull()
  })

  it('refuses the day on a room handed over on arrival', () => {
    expect(findHalvesConflict(INV, occ, [{ room_type: 'deluxe', qty: 1, room_numbers: ['202'] }], 'daylong', true, '2026-10-10'))
      .toMatch(/Room 202 is already taken by day/)
  })

  it('refuses any other night guest — the night is sold', () => {
    expect(findHalvesConflict(INV, occ, [{ room_type: 'deluxe', qty: 1, room_numbers: ['301'] }], 'night', true, '2026-10-10'))
      .toMatch(/already booked for the night/)
    expect(findHalvesConflict(INV, occ, [{ room_type: 'deluxe', qty: 1 }], 'night', true, '2026-10-10'))
      .toMatch(/0 of 4 free for the night/)
  })

  it('lets a night booking take a room held by day guests, but only as a 6 PM room', () => {
    const dayOcc = occupancyOnDate({ package_type: 'daylong', visit_date: '2026-10-10', check_out_date: null,
      rooms: [{ room_type: 'deluxe', qty: 1, room_numbers: ['301'] }] }, '2026-10-10')
    expect(findHalvesConflict(INV, dayOcc, [{ room_type: 'deluxe', qty: 1, room_numbers: ['301'], evening_rooms: ['301'] }], 'night', true, '2026-10-10')).toBeNull()
    expect(findHalvesConflict(INV, dayOcc, [{ room_type: 'deluxe', qty: 1, room_numbers: ['301'] }], 'night', true, '2026-10-10'))
      .toMatch(/handed over in the evening/)
  })

  it('counts at type level when no numbers are given', () => {
    // 4 rooms; 2 taken all day, 2 taken at night only → 2 free by day, 0 at night, 0 all day
    expect(findHalvesConflict(INV, occ, [{ room_type: 'deluxe', qty: 2 }], 'daylong', true, '2026-10-10')).toBeNull()
    expect(findHalvesConflict(INV, occ, [{ room_type: 'deluxe', qty: 3 }], 'daylong', true, '2026-10-10')).toMatch(/2 of 4 free by day/)
  })

  it('a 6 PM room is an ordinary room from the second night', () => {
    const occ11 = occupancyOnDate(NIGHT_SPLIT, '2026-10-11')
    expect(findHalvesConflict(INV, occ11, [{ room_type: 'deluxe', qty: 1, room_numbers: ['301'] }], 'daylong', true, '2026-10-11'))
      .toMatch(/taken by day/)
  })
})

describe('availabilityByHalves', () => {
  it('reports the two halves separately', () => {
    const occ = occupancyOnDate(NIGHT_SPLIT, '2026-10-10')
    const [d] = availabilityByHalves([{ room_type: 'deluxe', total_units: 4 }], occ)
    expect(d).toMatchObject({ booked_day: 2, available_day: 2, booked_night: 4, available_night: 0 })
  })

  it('"all day" counts a room as booked when either half is taken', () => {
    const dayOcc = occupancyOnDate({ package_type: 'daylong', visit_date: '2026-10-10', check_out_date: null,
      rooms: [{ room_type: 'deluxe', qty: 1, room_numbers: ['301'] }] }, '2026-10-10')
    const [d] = availabilityByHalves([{ room_type: 'deluxe', total_units: 4 }], dayOcc)
    // Day guest holds 301 until 6 PM: only 3 rooms are free for the whole day,
    // but all 4 are free for the night.
    expect(d).toMatchObject({ booked_day: 1, booked_night: 0, booked_any: 1, available_both: 3, available_night: 4 })
  })
})

describe('roomNumberBuckets', () => {
  const occ = occupancyOnDate(NIGHT_SPLIT, '2026-10-10')
  it('for a day visit: 6 PM rooms are free until evening', () => {
    const b = roomNumberBuckets(occ, 'daylong')
    expect(b.taken.sort()).toEqual(['202', '205'])
    expect(b.untilEvening.sort()).toEqual(['301', '302'])
  })
  it('for a night stay: a day-held room is evening-only', () => {
    const dayOcc = occupancyOnDate({ package_type: 'daylong', visit_date: '2026-10-10', check_out_date: null,
      rooms: [{ room_type: 'deluxe', qty: 1, room_numbers: ['301'] }] }, '2026-10-10')
    const b = roomNumberBuckets(dayOcc, 'night')
    expect(b.taken).toEqual([])
    expect(b.eveningOnly).toEqual(['301'])
  })
})
