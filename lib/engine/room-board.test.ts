import { describe, expect, it } from 'vitest'
import { buildRoomBoard, type BoardStayInput } from './room-board'

const D = '2026-10-19'
const stay = (o: Partial<BoardStayInput>): BoardStayInput => ({
  kind: 'booking', ref: 'B1', name: 'Karim', package_type: 'night', visit_date: D, check_out_date: '2026-10-21',
  adults: 2, children: 1, drivers: 0, rooms: [], ...o,
})
const ROOMS = ['202', '203', '204', '103', '104', '111', 'Conference']

describe('room board', () => {
  it('a night stay holds day and night; an evening room only the night', () => {
    const b = buildRoomBoard([stay({ rooms: [{ room_type: 'deluxe', qty: 2, room_numbers: ['202', '204'], evening_rooms: ['204'] }] })], {}, ROOMS, D)
    expect(b.cells['202'].day?.ref).toBe('B1')
    expect(b.cells['202'].night?.ref).toBe('B1')
    expect(b.cells['204'].day).toBeNull()
    expect(b.cells['204'].night).toMatchObject({ ref: 'B1', evening: true, nightIndex: 1, nights: 2 })
    expect(b.cells['202'].day?.rooms).toEqual(['202', '204'])
    expect(b.counts).toMatchObject({ booked: 2, dayOnly: 1, arrivals: 1, guestsTonight: 3 })
  })

  it('a day visitor and an evening guest share one room', () => {
    const b = buildRoomBoard([
      stay({ ref: 'D1', name: 'Rina', package_type: 'daylong', check_out_date: null, rooms: [{ room_type: 'cottage', qty: 1, room_numbers: ['103'] }] }),
      stay({ ref: 'N1', name: 'Hasan', rooms: [{ room_type: 'cottage', qty: 1, room_numbers: ['103'], evening_rooms: ['103'] }] }),
    ], {}, ROOMS, D)
    expect(b.cells['103'].day?.name).toBe('Rina')
    expect(b.cells['103'].night?.name).toBe('Hasan')
  })

  it('middle nights and checkout day', () => {
    const s = stay({ visit_date: '2026-10-18', check_out_date: '2026-10-20', rooms: [{ room_type: 'deluxe', qty: 1, room_numbers: ['203'] }] })
    expect(buildRoomBoard([s], {}, ROOMS, D).cells['203'].night).toMatchObject({ nightIndex: 2, nights: 2 })
    const out = buildRoomBoard([s], {}, ROOMS, '2026-10-20')
    expect(out.cells['203']).toMatchObject({ day: null, night: null })
    expect(out.cells['203'].departing?.ref).toBe('B1')
    expect(out.counts).toMatchObject({ freeAfterNoon: 1, departures: 1 })
  })

  it('blocked rooms, rooms without numbers and the conference room', () => {
    const b = buildRoomBoard([
      stay({ ref: 'T1', package_type: 'daylong', check_out_date: null, rooms: [{ room_type: 'tree_house', qty: 1, room_numbers: [] }] }),
      stay({ ref: 'C1', package_type: 'night', rooms: [{ room_type: 'conference_room', qty: 1, room_numbers: ['Conference'] }] }),
    ], { '111': 'Maintenance / repair' }, ROOMS, D)
    expect(b.cells['111'].blocked).toBe('Maintenance / repair')
    expect(b.unassigned).toHaveLength(1)
    expect(b.cells.Conference).toMatchObject({ day: { ref: 'C1' }, night: { ref: 'C1' } })
    expect(b.counts.blocked).toBe(1)
  })
})
