import { describe, expect, it } from 'vitest'
import { getAvailabilitySummary } from './availability'
import type { AvailabilityResult } from '@/lib/supabase/types'

const r = (over: Partial<AvailabilityResult>): AvailabilityResult =>
  ({ room_type: 'x', display_name: 'X', total_units: 4, booked: 0, available: 4, daylong_only: false, ...over }) as AvailabilityResult

describe('blocked rooms are not counted', () => {
  it('a fully blocked type is neither free nor fully booked', () => {
    const s = getAvailabilitySummary([r({ total_units: 0, available: 0, blocked: 4 }), r({}), r({ available: 0, booked: 4 })])
    expect(s).toEqual({ available: 1, partial: 0, fullyBooked: 1 })
  })
})
