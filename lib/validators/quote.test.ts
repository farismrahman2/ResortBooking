import { describe, expect, it } from 'vitest'
import { CreateQuoteSchema } from './quote'

/**
 * One physical room, one row. The villa stands on Deluxe 301 + 302, so a
 * quote cannot carry the villa and either of those rooms as a Deluxe.
 */

const PKG = '11111111-1111-4111-8111-111111111111'
const base = {
  customer_name: 'Test', customer_phone: '01700000000',
  package_id: PKG, package_type: 'night' as const,
  visit_date: '2026-10-10', check_out_date: '2026-10-11',
  adults: 4,
}
const villa = { room_type: 'villa_2br', display_name: 'Two-bedroom Villa', qty: 1, unit_price: 29000, room_numbers: ['301', '302'] }
const deluxe = (nums: string[]) =>
  ({ room_type: 'deluxe', display_name: 'Deluxe', qty: nums.length, unit_price: 14500, room_numbers: nums })

const messages = (input: unknown) => {
  const r = CreateQuoteSchema.safeParse(input)
  return r.success ? [] : r.error.issues.map((i) => i.message)
}

describe('rooms on one quote', () => {
  it('refuses the villa next to Deluxe 301 or 302', () => {
    expect(messages({ ...base, rooms: [deluxe(['301', '302']), villa] }).join('\n'))
      .toMatch(/Room 301 is already on this quote under Deluxe/)
  })

  it('refuses it the other way round too', () => {
    expect(messages({ ...base, rooms: [villa, deluxe(['302'])] }).join('\n'))
      .toMatch(/Room 302 is already on this quote under Two-bedroom Villa/)
  })

  it('allows the villa beside the other two Deluxe rooms', () => {
    expect(messages({ ...base, rooms: [deluxe(['202', '205']), villa] })).toEqual([])
  })

  it('reads a villa row with no numbers as 301 + 302', () => {
    expect(messages({ ...base, rooms: [deluxe(['301']), { ...villa, room_numbers: [] }] }).join('\n'))
      .toMatch(/Room 301 is already on this quote/)
  })
})
