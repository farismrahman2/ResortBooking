import { describe, expect, it } from 'vitest'
import { adjust, canSeeRealRevenue, isRealRevenuePath, pctForMonth } from './display'

describe('revenue display', () => {
  it('only the admin sees real revenue', () => {
    expect(canSeeRealRevenue('admin')).toBe(true)
    for (const r of ['md', 'manager', 'accountant', 'front_desk', 'reservation', null]) expect(canSeeRealRevenue(r)).toBe(false)
  })
  it('closes revenue screens but keeps the daily takings report', () => {
    expect(isRealRevenuePath('/reports/income')).toBe(true)
    expect(isRealRevenuePath('/reports/income/by-package')).toBe(true)
    expect(isRealRevenuePath('/analytics')).toBe(true)
    expect(isRealRevenuePath('/api/data-export/bookings')).toBe(true)
    expect(isRealRevenuePath('/api/data-export/expenses')).toBe(false)
    expect(isRealRevenuePath('/reports/income/by-payment-method')).toBe(false)
    expect(isRealRevenuePath('/reports/operations')).toBe(false)
    expect(isRealRevenuePath('/reports/expenses')).toBe(false)
    expect(isRealRevenuePath('/reports/incomex')).toBe(false)
  })
  it('a month uses its own %, else the latest earlier one, else 100%', () => {
    const rules = [{ month: '2026-08-01', pct: 70 }, { month: '2026-10-01', pct: 60 }]
    expect(pctForMonth(rules, '2026-10-12')).toBe(60)
    expect(pctForMonth(rules, '2026-09-30')).toBe(70)
    expect(pctForMonth(rules, '2026-12-01')).toBe(60)
    expect(pctForMonth(rules, '2026-07-01')).toBe(100)
    expect(pctForMonth([], '2026-10-01')).toBe(100)
  })
  it('rounds to whole taka', () => {
    expect(adjust(1234567, 60)).toBe(740740)
    expect(adjust(1000, 33.33)).toBe(333)
  })
})
