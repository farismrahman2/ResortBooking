import { describe, expect, it } from 'vitest'
import { MAPPED_ROOMS, ROOM_MAP, floorRooms } from './room-map'
import { ROOM_NUMBERS } from './rooms'

describe('room map', () => {
  it('draws every numbered bedroom exactly once', () => {
    const all = Object.entries(ROOM_NUMBERS).filter(([t]) => t !== 'conference_room').flatMap(([, n]) => n ?? [])
    expect([...MAPPED_ROOMS].sort()).toEqual([...all].sort())
    expect(new Set(MAPPED_ROOMS).size).toBe(MAPPED_ROOMS.length)
  })
  it('keeps the Main Villa 2nd-floor shape from the sketch', () => {
    const f2 = ROOM_MAP.find((b) => b.id === 'main')!.floors[0]
    expect(floorRooms(f2)).toEqual(['206', '205', '202', '203', '207', '204'])
  })
})
