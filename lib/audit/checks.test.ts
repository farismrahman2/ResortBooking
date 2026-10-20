import { describe, expect, it } from 'vitest'
import { checkBookings, validPhone, type AuditBooking } from './checks/bookings'
import { checkExpenses, type AuditExpense } from './checks/expenses'
import { checkInventory } from './checks/inventory'
import { costUsd, dueOn } from './agents'

const TODAY = '2026-10-20'
const booking = (o: Partial<AuditBooking> = {}): AuditBooking => ({
  id: 'b1', booking_number: 'GCR-B-1', customer_name: 'Guest', customer_phone: '01711000000',
  package_type: 'night', visit_date: '2026-10-25', check_out_date: '2026-10-26', status: 'confirmed',
  subtotal: 10000, discount: 0, total: 10000, advance_paid: 5000, remaining: 5000,
  line_items: [{ subtotal: 10000 }], created_at: '2026-10-10T08:00:00Z',
  rooms: [{ room_type: 'deluxe', qty: 1, room_numbers: ['301'] }], ...o,
})
const ids = (fs: { id: string }[]) => fs.map((f) => f.id)

describe('booking checks', () => {
  it('a clean booking raises nothing', () => {
    expect(checkBookings({ bookings: [booking()], quotes: [], prices: [], today: TODAY })).toEqual([])
  })
  it('flags money that does not add up', () => {
    const f = checkBookings({ bookings: [
      booking({ id: 'a', booking_number: 'A', advance_paid: 12000 }),
      booking({ id: 'b', booking_number: 'B', line_items: [{ subtotal: 9000 }] }),
      booking({ id: 'c', booking_number: 'C', remaining: -500 }),
    ], quotes: [], prices: [], today: TODAY })
    expect(ids(f)).toEqual(expect.arrayContaining(['booking-advance-over-total', 'booking-lines-mismatch', 'booking-negative-balance']))
  })
  it('flags the same room booked twice', () => {
    const f = checkBookings({ bookings: [booking({ id: 'a', booking_number: 'A' }), booking({ id: 'b', booking_number: 'B' })], quotes: [], prices: [], today: TODAY })
    const clash = f.find((x) => x.id === 'booking-double-booked')
    expect(clash?.examples[0].ref).toBe('Room 301')
  })
  it('flags stays never closed, missing room numbers and big discounts', () => {
    const f = checkBookings({ bookings: [
      booking({ id: 'a', booking_number: 'A', visit_date: '2026-10-01', check_out_date: '2026-10-02' }),
      booking({ id: 'b', booking_number: 'B', rooms: [{ room_type: 'deluxe', qty: 2, room_numbers: ['302'] }] }),
      booking({ id: 'c', booking_number: 'C', rooms: [{ room_type: 'deluxe', qty: 1, room_numbers: ['303'] }], discount: 3000, total: 7000 }),
    ], quotes: [], prices: [], today: TODAY })
    expect(ids(f)).toEqual(expect.arrayContaining(['booking-not-closed', 'booking-missing-room-numbers', 'booking-big-discount']))
  })
  it('knows a Bangladesh mobile number', () => {
    expect(validPhone('01711-000000')).toBe(true)
    expect(validPhone('+8801711000000')).toBe(true)
    expect(validPhone('1711000000')).toBe(false)
    expect(validPhone(null)).toBe(false)
  })
})

const expense = (o: Partial<AuditExpense> = {}): AuditExpense => ({
  id: 'e1', expense_date: '2026-10-15', amount: 2000, payment_method: 'cash', category_id: 'c1', category_name: 'Bazar',
  payee_id: 'p1', payee_name: 'Shop', description: null, is_draft: false, created_at: '2026-10-15T10:00:00Z', attachments: 1, ...o,
})

describe('expense checks', () => {
  it('flags duplicates, missing receipts and the absence of budgets', () => {
    const f = checkExpenses({ expenses: [
      expense({ id: 'a' }), expense({ id: 'b' }),
      expense({ id: 'c', amount: 25000, attachments: 0, payee_id: 'p2' }),
    ], budgets: [], templates: [], today: TODAY })
    expect(ids(f)).toEqual(expect.arrayContaining(['expense-duplicate', 'expense-no-receipt', 'expense-no-budgets']))
    expect(f.find((x) => x.id === 'expense-duplicate')?.amount).toBe(2000)
  })
  it('flags a category over budget', () => {
    const f = checkExpenses({ expenses: [expense({ amount: 9000 })], budgets: [{ category_id: 'c1', category_name: 'Bazar', amount: 5000 }], templates: [], today: TODAY })
    expect(f.find((x) => x.id === 'expense-over-budget')?.amount).toBe(4000)
  })
})

describe('inventory checks', () => {
  const empty = { items: [], countLines: [], receipts: [], requisitions: [], deliveries: [], sales: [], today: TODAY }
  it('flags negative stock, count shortfalls and price jumps', () => {
    const f = checkInventory({ ...empty,
      items: [{ id: 'i', name: 'Rice', current_stock: -3, reorder_point: 10, avg_purchase_price: 80, allow_negative_stock: false, is_active: true }],
      countLines: [{ count_number: 'C-1', count_id: 'c', count_date: '2026-10-10', item_name: 'Oil', system_qty: 50, counted_qty: 40, unit_value: 200 }],
      receipts: [
        { item_id: 'i', item_name: 'Rice', movement_date: '2026-09-01', unit_price: 80, supplier: 'A', movement_id: 'm1' },
        { item_id: 'i', item_name: 'Rice', movement_date: '2026-10-15', unit_price: 100, supplier: 'A', movement_id: 'm2' },
      ],
    })
    expect(ids(f)).toEqual(expect.arrayContaining(['inv-negative-stock', 'inv-count-shortfall', 'inv-price-jump']))
    expect(f.find((x) => x.id === 'inv-count-shortfall')?.amount).toBe(2000)
  })
  it('flags supplier bills unpaid past 30 days', () => {
    const f = checkInventory({ ...empty, deliveries: [{ id: 'd', delivery_no: 'D-1', delivery_date: '2026-09-01', status: 'confirmed', requisition_id: 'r', vendor: 'Fish', total_amount: 10000, supplier_memo_total: null, allocated: 4000 }] })
    expect(f.find((x) => x.id === 'kitchen-unpaid-30')?.amount).toBe(6000)
  })
})

describe('schedule and cost', () => {
  it('weekly on Sundays, monthly on the 1st', () => {
    expect(dueOn('2026-10-20')).toEqual(['daily'])
    expect(dueOn('2026-10-25')).toEqual(['daily', 'weekly'])
    expect(dueOn('2026-11-01')).toEqual(['daily', 'weekly', 'monthly'])
  })
  it('prices batches at half', () => {
    expect(costUsd('claude-haiku-5-5', 10000, 2000, false)).toBeCloseTo(0.002)
    expect(costUsd('claude-opus-5-5', 150000, 15000, true)).toBeCloseTo(0.45)
  })
})

describe('noise filters', () => {
  it('accepts two phone numbers in one field', () => {
    expect(validPhone('01796025518 / 01720121412')).toBe(true)
  })
  it('does not flag salaries for receipts', () => {
    const f = checkExpenses({ expenses: [expense({ amount: 30000, attachments: 0, category_name: 'Salary' })], budgets: [{ category_id: 'x', category_name: 'x', amount: 1 }], templates: [], today: TODAY })
    expect(ids(f)).not.toContain('expense-no-receipt')
  })
  it('only stays ended in the last 30 days count as never closed', () => {
    const f = checkBookings({ bookings: [booking({ visit_date: '2026-04-01', check_out_date: '2026-04-02' })], quotes: [], prices: [], today: TODAY })
    expect(ids(f)).not.toContain('booking-not-closed')
  })
})
