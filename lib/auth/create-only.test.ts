import { describe, expect, it } from 'vitest'
import { canSeeRecord, isCreateOnlyRole, maskDuplicates } from './create-only'

describe('create-only (Corporate Sales) rules', () => {
  const sales = { user_id: 'u1', roleSlug: 'corporate_sales' }
  it('only corporate_sales is create-only', () => {
    expect(isCreateOnlyRole('corporate_sales')).toBe(true)
    for (const r of ['admin', 'reservation', 'front_desk', 'inventory', null, undefined]) expect(isCreateOnlyRole(r)).toBe(false)
  })
  it('sales see only what they created', () => {
    expect(canSeeRecord(sales, 'u1')).toBe(true)
    expect(canSeeRecord(sales, 'u2')).toBe(false)
    expect(canSeeRecord(sales, null)).toBe(false)            // made before tracking began
  })
  it('everyone else sees every record', () => {
    expect(canSeeRecord({ user_id: 'u9', roleSlug: 'reservation' }, 'u1')).toBe(true)
    expect(canSeeRecord({ user_id: 'u9', roleSlug: 'admin' }, null)).toBe(true)
  })
  it('duplicate warnings hide the other booking for sales', () => {
    const row = { id: 'b1', number: 'GCR-B-1', customer_name: 'X', customer_phone: '017', total: 9000, visit_date: '2026-11-05' }
    expect(maskDuplicates([row], 'corporate_sales')[0]).toEqual({ ...row, id: '', number: '—', customer_name: '', customer_phone: '', total: 0 })
    expect(maskDuplicates([row], 'reservation')[0]).toBe(row)
  })
})

import { lockMoneyFields, type StoredBookingMoney } from './create-only'

describe('lockMoneyFields (Corporate Sales edits)', () => {
  const stored: StoredBookingMoney = {
    subtotal: 20000, discount: 3000, discount_pct: 10, service_charge_pct: 5, vat_pct: 0,
    advance_paid: 5000, advance_required: 10000,
    extra_items: [{ label: 'BBQ', qty: 1, unit_price: 4000 }],
    package_type: 'daylong', visit_date: '2026-12-01', check_out_date: null,
    package_snapshot: { room_prices: { cottage: 6000, deluxe: 9000 } },
    rooms: [{ room_type: 'cottage', unit_price: 5500 }, { room_type: 'deluxe', unit_price: 0, qty: 1, room_numbers: ['301'] }],
  }
  const edit = {
    customer_name: 'New Name', adults: 40,
    discount: 99999, discount_pct: 50, service_charge_pct: 0, vat_pct: 0, advance_paid: 0, advance_required: 0,
    rooms: [
      { room_type: 'cottage', unit_price: 1, qty: 2, room_numbers: ['103', '104'] },
      { room_type: 'deluxe', unit_price: 1, qty: 1, room_numbers: ['302'] },
      { room_type: 'cottage', unit_price: 0, qty: 3, room_numbers: ['105', '106', '107'] },   // a "free" room he tries to add
    ],
    extra_items: [{ label: 'BBQ', qty: 1, unit_price: 0 }],
    package_type: 'night', visit_date: '2027-01-01', check_out_date: '2027-01-02', package_snapshot: { room_prices: {} },
  }
  const out = lockMoneyFields(edit, stored)
  it('keeps guest details and headcount from the edit', () => {
    expect(out.customer_name).toBe('New Name')
    expect(out.adults).toBe(40)
  })
  it('puts every money term back', () => {
    expect(out.discount).toBe(1000)            // 3000 stored − 10% of 20000
    expect(out.discount_pct).toBe(10)
    expect(out.service_charge_pct).toBe(5)
    expect(out.advance_paid).toBe(5000)
    expect(out.advance_required).toBe(10000)
    expect(out.extra_items).toEqual(stored.extra_items)
    expect(out.package_type).toBe('daylong')
    expect(out.visit_date).toBe('2026-12-01')
    expect(out.package_snapshot).toBe(stored.package_snapshot)
  })
  it('prices rooms at the booked rate, or the package rate for a new room type', () => {
    expect(out.rooms.slice(0, 2).map((r) => [r.room_type, r.unit_price])).toEqual([['cottage', 5500], ['deluxe', 9000]])
  })
  it('complimentary rooms stay exactly as stored — none added, none removed', () => {
    const free = out.rooms.filter((r) => r.unit_price === 0)
    expect(free).toHaveLength(1)
    expect(free[0]).toMatchObject({ room_type: 'deluxe', qty: 1, room_numbers: ['301'] })
  })
})
