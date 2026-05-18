import { describe, expect, it } from 'vitest'
import { getExtraGuestUnitPrice } from './extras-pricing'
import type { BookingRow } from '@/lib/supabase/types'

function bookingFixture(overrides: Partial<BookingRow>): BookingRow {
  return {
    id: 'b1', booking_number: 'GCR-B-2026-0001', quote_id: null,
    customer_name: 'Test', customer_phone: '01700000000', customer_notes: null,
    package_type: 'daylong', visit_date: '2026-05-08', check_out_date: null,
    nights: null, adults: 4, children_paid: 0, children_free: 0,
    drivers: 0, extra_beds: 0,
    subtotal: 0, discount: 0, discount_pct: 0, service_charge_pct: 0,
    total: 0, advance_required: 0, advance_paid: 0, due_advance: 0, remaining: 0,
    status: 'confirmed', sales_employee_id: null,
    package_snapshot: {} as any, line_items: [], extra_items: [],
    created_at: '', updated_at: '',
    ...overrides,
  }
}

describe('getExtraGuestUnitPrice — night package', () => {
  it('returns snapshot.extra_person regardless of line items', () => {
    const booking = bookingFixture({
      package_type: 'night',
      package_snapshot: { extra_person: 500, weekday_adult: 800 } as any,
      line_items: [{ kind: 'adult', label: 'Adults', qty: 4, unit_price: 1200, nights: null, subtotal: 4800 }] as any,
    })
    expect(getExtraGuestUnitPrice(booking)).toBe(500)
  })

  it('returns 0 when extra_person is missing', () => {
    const booking = bookingFixture({
      package_type: 'night',
      package_snapshot: {} as any,
    })
    expect(getExtraGuestUnitPrice(booking)).toBe(0)
  })
})

describe('getExtraGuestUnitPrice — daylong package', () => {
  it('prefers a line item tagged kind: "adult"', () => {
    const booking = bookingFixture({
      adults: 4,
      package_snapshot: { weekday_adult: 800 } as any,
      line_items: [
        { kind: 'room', label: 'Cottage × 1', qty: 1, unit_price: 5000, nights: null, subtotal: 5000 },
        { kind: 'adult', label: 'Adults (Friday rate)', qty: 4, unit_price: 1500, nights: null, subtotal: 6000 },
      ] as any,
    })
    expect(getExtraGuestUnitPrice(booking)).toBe(1500)
  })

  it('falls back to label regex when kind is missing (legacy bookings)', () => {
    const booking = bookingFixture({
      adults: 4,
      package_snapshot: { weekday_adult: 800 } as any,
      line_items: [
        { label: 'Adults (Friday rate)', qty: 4, unit_price: 1500, nights: null, subtotal: 6000 },
      ] as any,
    })
    expect(getExtraGuestUnitPrice(booking)).toBe(1500)
  })

  it('falls back to snapshot.weekday_adult when no adult line exists', () => {
    const booking = bookingFixture({
      adults: 4,
      package_snapshot: { weekday_adult: 800 } as any,
      line_items: [],
    })
    expect(getExtraGuestUnitPrice(booking)).toBe(800)
  })

  it('regression: never returns 0 for a daylong booking with a non-zero weekday_adult fallback', () => {
    // The original bug: code read snapshot.extra_person which is 0 for daylong,
    // making the extra-guest charge default to ৳0.
    const booking = bookingFixture({
      adults: 4,
      package_snapshot: { extra_person: 0, weekday_adult: 800 } as any,
      line_items: [
        { kind: 'adult', label: 'Adults', qty: 4, unit_price: 1200, nights: null, subtotal: 4800 },
      ] as any,
    })
    expect(getExtraGuestUnitPrice(booking)).toBe(1200)
    expect(getExtraGuestUnitPrice(booking)).not.toBe(0)
  })
})
