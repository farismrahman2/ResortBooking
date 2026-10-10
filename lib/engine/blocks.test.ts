import { describe, expect, it } from 'vitest'
import {
  blockActiveOn, blockedRooms, blockStays, findBlockConflicts, blockedUnitsOn, blockedNumbersOn,
  type RoomBlock,
} from './blocks'
import { occupancyOnDate, findHalvesConflict, availabilityByHalves, type StayLike } from './halves'

const INV = [
  { room_type: 'deluxe', total_units: 4 }, { room_type: 'cottage', total_units: 5 },
  { room_type: 'tree_house', total_units: 1 }, { room_type: 'villa_2br', total_units: 1 },
  { room_type: 'premium_deluxe_canopy', total_units: 16 }, { room_type: 'deluxe_canopy', total_units: 5 },
]
const block = (over: Partial<RoomBlock>): RoomBlock => ({
  id: 'b1', all_rooms: false, room_types: [], room_numbers: [], start_date: '2026-10-05',
  end_date: '2026-10-07', weekdays: null, reason_kind: 'maintenance', reason: null, ...over,
})

describe('which rooms a block holds', () => {
  it('a room type means every room of it', () => {
    expect(blockedRooms(block({ room_types: ['premium_deluxe_canopy', 'deluxe_canopy'] }), INV))
      .toEqual([
        { room_type: 'premium_deluxe_canopy', qty: 16, room_numbers: ['111', '112', '113', '114', '212', '213', '214', '312', '313', '314', '412', '413', '414', '512', '513', '514'] },
        { room_type: 'deluxe_canopy', qty: 5, room_numbers: ['115', '215', '315', '415', '515'] },
      ])
  })
  it('specific rooms are grouped by their type', () => {
    expect(blockedRooms(block({ room_numbers: ['301', '103'] }), INV)).toEqual([
      { room_type: 'deluxe', qty: 1, room_numbers: ['301'] },
      { room_type: 'cottage', qty: 1, room_numbers: ['103'] },
    ])
  })
  it('the villa is blocked through 301 + 302', () => {
    expect(blockedRooms(block({ room_types: ['villa_2br'] }), INV))
      .toEqual([{ room_type: 'deluxe', qty: 2, room_numbers: ['301', '302'] }])
  })
  it('the whole property covers numbered and unnumbered rooms, not the villa twice', () => {
    const rooms = blockedRooms(block({ all_rooms: true }), INV)
    expect(rooms.find((r) => r.room_type === 'tree_house')).toEqual({ room_type: 'tree_house', qty: 1, room_numbers: [] })
    expect(rooms.find((r) => r.room_type === 'deluxe')?.qty).toBe(4)
    expect(rooms.some((r) => r.room_type === 'villa_2br')).toBe(false)
  })
})

describe('when a block is in force', () => {
  it('inclusive dates; open-ended runs on', () => {
    expect(blockActiveOn(block({}), '2026-10-04')).toBe(false)
    expect(blockActiveOn(block({}), '2026-10-07')).toBe(true)
    expect(blockActiveOn(block({}), '2026-10-08')).toBe(false)
    expect(blockActiveOn(block({ end_date: null }), '2027-03-01')).toBe(true)
  })
  it('only on chosen weekdays', () => {
    const fridays = block({ start_date: '2026-10-01', end_date: null, weekdays: [5] })
    expect(blockActiveOn(fridays, '2026-10-09')).toBe(true)   // Friday
    expect(blockActiveOn(fridays, '2026-10-10')).toBe(false)  // Saturday
  })
})

describe('a block as occupancy', () => {
  const stays = blockStays([block({ room_numbers: ['301'] })], '2026-10-01', '2026-10-10', INV)
  it('one whole-day stay per active date', () => {
    expect(stays.map((s) => s.visit_date)).toEqual(['2026-10-05', '2026-10-06', '2026-10-07'])
    const occ = occupancyOnDate(stays[0], '2026-10-05')
    expect(occ[0]).toMatchObject({ room_numbers: ['301'], day: true, night: true })
  })
  it('refuses a day visit and a night stay on the blocked room, and the villa with it', () => {
    const occ = stays.flatMap((s) => occupancyOnDate(s, '2026-10-06'))
    const inv = new Map([['deluxe', 4]])
    expect(findHalvesConflict(inv, occ, [{ room_type: 'deluxe', qty: 1, room_numbers: ['301'] }], 'daylong', true, '2026-10-06')).toMatch(/301/)
    expect(findHalvesConflict(inv, occ, [{ room_type: 'deluxe', qty: 1, room_numbers: ['301'] }], 'night', true, '2026-10-06')).toMatch(/301/)
    expect(findHalvesConflict(inv, occ, [{ room_type: 'villa_2br', qty: 1 }], 'night', true, '2026-10-06')).toMatch(/301/)
    const villa = availabilityByHalves([{ room_type: 'villa_2br', total_units: 1 }], occ)[0]
    expect(villa.available_both).toBe(0)
  })
  it('leaves the day after free', () => {
    const occ = stays.flatMap((s) => occupancyOnDate(s, '2026-10-08'))
    expect(occ).toEqual([])
  })
})

describe('a block over existing bookings is refused', () => {
  const night: StayLike = { package_type: 'night', visit_date: '2026-10-06', check_out_date: '2026-10-08',
    rooms: [{ room_type: 'deluxe', qty: 1, room_numbers: ['302'] }], ref: 'GCR-B-2026-1100' }
  const dayElsewhere: StayLike = { package_type: 'daylong', visit_date: '2026-10-06', check_out_date: null,
    rooms: [{ room_type: 'deluxe', qty: 1, room_numbers: ['202'] }], ref: 'GCR-B-2026-1101' }

  it('names the booking, the date and the room', () => {
    expect(findBlockConflicts(block({ room_types: ['villa_2br'] }), [night, dayElsewhere], INV)).toEqual([
      { ref: 'GCR-B-2026-1100', date: '2026-10-06', rooms: ['302'] },
      { ref: 'GCR-B-2026-1100', date: '2026-10-07', rooms: ['302'] },
    ])
  })
  it('ignores a booking on dates the block skips', () => {
    const fridaysOnly = block({ room_types: ['villa_2br'], weekdays: [5] })   // 6–7 Oct are Tue, Wed
    expect(findBlockConflicts(fridaysOnly, [night], INV)).toEqual([])
  })
  it('a count-only booking conflicts only when the whole type is blocked', () => {
    const countOnly: StayLike = { ...dayElsewhere, rooms: [{ room_type: 'deluxe', qty: 1, room_numbers: [] }] }
    expect(findBlockConflicts(block({ room_numbers: ['301'] }), [countOnly], INV)).toEqual([])
    expect(findBlockConflicts(block({ room_types: ['deluxe'] }), [countOnly], INV)).toHaveLength(1)
  })
})

describe('reporting helpers', () => {
  const blocks = [block({ room_types: ['premium_deluxe_canopy'] }), block({ id: 'b2', room_numbers: ['111', '115'] })]
  it('counts physical units once', () => {
    expect(blockedUnitsOn(blocks, '2026-10-06', INV)).toBe(17)   // all 16 Premium Deluxe Canopy (111 among them) + 115
    expect(blockedUnitsOn(blocks, '2026-10-09', INV)).toBe(0)
  })
  it('names why each number is blocked', () => {
    expect(blockedNumbersOn(blocks, ['2026-10-06'], INV)['113']).toBe('Maintenance / repair')
  })
})
