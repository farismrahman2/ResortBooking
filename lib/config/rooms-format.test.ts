import { describe, expect, it } from 'vitest'
import { formatRoomList, roomLocation, roomTypeBuilding } from './rooms'

describe('room locations', () => {
  it('canopy is x11–x15, floor from the first digit', () => {
    expect(roomLocation('212')).toEqual({ building: 'canopy', floor: 2 })
    expect(roomLocation('205')).toEqual({ building: 'main', floor: 2 })
    expect(roomLocation('Conference')).toEqual({ building: 'other', floor: null })
    expect(roomTypeBuilding('deluxe_canopy')).toBe('canopy')
    expect(roomTypeBuilding('cottage')).toBe('main')
  })
})

describe('formatRoomList', () => {
  it('shortens runs of real neighbouring rooms only', () => {
    expect(formatRoomList(['103', '104', '105', '106', '202', '205'])).toBe('Main 103–106, 202, 205')
    expect(formatRoomList(['212', '213', '214', '215'])).toBe('Canopy 212–215')
    expect(formatRoomList(['212', '213'])).toBe('Canopy 212, 213')
  })
  it('names whole canopy floors', () => {
    const f35 = ['311', '312', '313', '314', '315', '411', '412', '413', '414', '415', '511', '512', '513', '514', '515']
    expect(formatRoomList([...f35, '112'])).toBe('Canopy floors 3–5, 112')
    expect(formatRoomList(['211', '212', '213', '214', '215'])).toBe('Canopy floor 2')
  })
  it('keeps buildings apart and in order, with odd rooms last', () => {
    expect(formatRoomList(['Conference', '115', '108', '101', '102'])).toBe('Main 101, 102, 108 · Canopy 115 · Conference')
  })
  it('localises digits', () => {
    expect(formatRoomList(['103', '104', '105'], { fmt: (n) => `#${n}` })).toBe('Main #103–#105')
  })
})
