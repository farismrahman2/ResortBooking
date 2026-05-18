import { describe, expect, it } from 'vitest'
import { checkRoomAvailability, isRoomAvailable, getAvailabilitySummary } from './availability'
import type { RoomInventoryRow } from '@/lib/supabase/types'

const inventory: RoomInventoryRow[] = [
  { id: 'i1', room_type: 'cottage',     display_name: 'Cottage',     total_units: 5, daylong_only: false, display_order: 1, created_at: '', updated_at: '' },
  { id: 'i2', room_type: 'eco_deluxe',  display_name: 'Eco Deluxe',  total_units: 2, daylong_only: false, display_order: 2, created_at: '', updated_at: '' },
  { id: 'i3', room_type: 'tree_house',  display_name: 'Tree House',  total_units: 1, daylong_only: true,  display_order: 3, created_at: '', updated_at: '' },
] as any

describe('checkRoomAvailability', () => {
  it('marks all rooms fully available when nothing is occupied', () => {
    const out = checkRoomAvailability(inventory, [])
    expect(out.find((r) => r.room_type === 'cottage')).toMatchObject({ booked: 0, available: 5 })
    expect(out.find((r) => r.room_type === 'eco_deluxe')).toMatchObject({ booked: 0, available: 2 })
  })

  it('sums multiple occupied rows for the same room_type', () => {
    const out = checkRoomAvailability(inventory, [
      { room_type: 'eco_deluxe', qty_booked: 1 },
      { room_type: 'eco_deluxe', qty_booked: 1 },
    ])
    expect(out.find((r) => r.room_type === 'eco_deluxe')).toMatchObject({ booked: 2, available: 0 })
  })

  it('marks a room fully booked when occupied = total', () => {
    const out = checkRoomAvailability(inventory, [{ room_type: 'cottage', qty_booked: 5 }])
    expect(out.find((r) => r.room_type === 'cottage')).toMatchObject({ booked: 5, available: 0 })
  })

  it('clamps available to 0 when over-booked (defensive)', () => {
    const out = checkRoomAvailability(inventory, [{ room_type: 'cottage', qty_booked: 10 }])
    expect(out.find((r) => r.room_type === 'cottage')!.available).toBe(0)
  })

  it('hides daylong-only rooms when checking night availability', () => {
    const out = checkRoomAvailability(inventory, [], 'night')
    expect(out.find((r) => r.room_type === 'tree_house')).toBeUndefined()
    expect(out.find((r) => r.room_type === 'cottage')).toBeDefined()
  })

  it('shows daylong-only rooms when checking daylong availability', () => {
    const out = checkRoomAvailability(inventory, [], 'daylong')
    expect(out.find((r) => r.room_type === 'tree_house')).toBeDefined()
  })
})

describe('isRoomAvailable', () => {
  it('true when enough remaining', () => {
    const result = checkRoomAvailability(inventory, [{ room_type: 'cottage', qty_booked: 2 }])
    expect(isRoomAvailable('cottage', 3, result)).toBe(true)
  })

  it('false when not enough remaining', () => {
    const result = checkRoomAvailability(inventory, [{ room_type: 'cottage', qty_booked: 4 }])
    expect(isRoomAvailable('cottage', 2, result)).toBe(false)
  })
})

describe('getAvailabilitySummary', () => {
  it('counts available / partial / fully booked', () => {
    const result = checkRoomAvailability(inventory, [
      { room_type: 'cottage', qty_booked: 5 },     // fully booked
      { room_type: 'eco_deluxe', qty_booked: 1 },  // partial
      // tree_house untouched → fully available
    ])
    expect(getAvailabilitySummary(result)).toEqual({ available: 1, partial: 1, fullyBooked: 1 })
  })
})
