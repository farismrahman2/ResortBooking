import { describe, expect, it } from 'vitest'
import { calcChargesTotal, calcPaymentsTotal, calcTotalDue, calcNetDue } from './totals'

describe('calcChargesTotal', () => {
  it('sums the amount field when present', () => {
    const charges = [
      { amount: 100, quantity: 1, unit_price: 100 },
      { amount: 250, quantity: 2, unit_price: 125 },
    ]
    expect(calcChargesTotal(charges as any)).toBe(350)
  })

  it('falls back to quantity × unit_price when amount is null', () => {
    const charges = [
      { amount: null, quantity: 3, unit_price: 50 },
      { amount: undefined, quantity: 2, unit_price: 75 },
    ]
    expect(calcChargesTotal(charges as any)).toBe(300)
  })

  it('returns 0 for an empty list', () => {
    expect(calcChargesTotal([])).toBe(0)
  })

  it('rounds to 2 decimal places', () => {
    const charges = [
      { amount: 0.1, quantity: 1, unit_price: 0.1 },
      { amount: 0.2, quantity: 1, unit_price: 0.2 },
    ]
    expect(calcChargesTotal(charges as any)).toBe(0.3)
  })
})

describe('calcPaymentsTotal', () => {
  it('sums payment amounts', () => {
    expect(calcPaymentsTotal([{ amount: 1000 }, { amount: 500 }] as any)).toBe(1500)
  })

  it('handles null/undefined as 0', () => {
    expect(calcPaymentsTotal([{ amount: null }, { amount: 200 }] as any)).toBe(200)
  })

  it('returns 0 for an empty list', () => {
    expect(calcPaymentsTotal([])).toBe(0)
  })
})

describe('calcTotalDue', () => {
  it('adds bookingTotal + chargesTotal − discount', () => {
    expect(calcTotalDue({ bookingTotal: 5000, chargesTotal: 800, discountAmount: 300 })).toBe(5500)
  })

  it('treats missing discount as 0', () => {
    expect(calcTotalDue({ bookingTotal: 1000, chargesTotal: 200 })).toBe(1200)
  })
})

describe('calcNetDue', () => {
  it('positive when guest still owes', () => {
    expect(calcNetDue({
      bookingTotal: 5000, chargesTotal: 800, advance: 2000, paymentsTotal: 0,
    })).toBe(3800)
  })

  it('zero when settled', () => {
    expect(calcNetDue({
      bookingTotal: 5000, chargesTotal: 0, advance: 2000, paymentsTotal: 3000,
    })).toBe(0)
  })

  it('negative when resort owes guest a refund', () => {
    expect(calcNetDue({
      bookingTotal: 5000, chargesTotal: 200, advance: 6000, paymentsTotal: 0,
    })).toBe(-800)
  })

  it('discount reduces net due', () => {
    const withoutDiscount = calcNetDue({
      bookingTotal: 5000, chargesTotal: 0, advance: 2000, paymentsTotal: 0,
    })
    const withDiscount = calcNetDue({
      bookingTotal: 5000, chargesTotal: 0, advance: 2000, paymentsTotal: 0,
      discountAmount: 500,
    })
    expect(withoutDiscount - withDiscount).toBe(500)
  })

  it('regression: advance > extras still nets correctly against the whole stay', () => {
    // Pre-fix bug: net_due was charges − advance − payments, ignoring booking total.
    // Booking 5000, advance 2000, only 200 in extras → guest still owes 3200, NOT a refund of 1800.
    expect(calcNetDue({
      bookingTotal: 5000, chargesTotal: 200, advance: 2000, paymentsTotal: 0,
    })).toBe(3200)
  })
})
