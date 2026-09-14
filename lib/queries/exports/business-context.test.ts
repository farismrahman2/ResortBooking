import { describe, expect, it, vi } from 'vitest'

/**
 * The export's arithmetic, fed known bookings: the weekday split and the
 * occupancy figures are what the whole pack exists to answer, so they are
 * worth pinning.
 */

const BOOKINGS = [
  // Saturday, full price, 3 rooms
  { booking_number: 'B1', package_type: 'daylong', visit_date: '2026-09-05', check_out_date: null,
    nights: null, adults: 20, children_paid: 2, children_free: 0, drivers: 1, subtotal: 50000,
    discount: 0, discount_pct: 0, total: 50000, advance_paid: 10000, status: 'checked_out',
    is_corporate: false, company_name: null, customer_phone: '01700000001', source_module: 'manual',
    created_at: '2026-09-01T06:00:00Z', package_snapshot: { name: 'Daylong Package' }, extra_items: [],
    booking_rooms: [{ room_type: 'cottage', qty: 3, unit_price: 5000 }] },
  // Monday, discounted, 1 room
  { booking_number: 'B2', package_type: 'daylong', visit_date: '2026-09-07', check_out_date: null,
    nights: null, adults: 4, children_paid: 0, children_free: 0, drivers: 0, subtotal: 20000,
    discount: 5000, discount_pct: 25, total: 15000, advance_paid: 5000, status: 'confirmed',
    is_corporate: true, company_name: 'Pathao', customer_phone: '01700000002', source_module: 'manual',
    created_at: '2026-09-06T06:00:00Z', package_snapshot: { name: 'Daylong Package' }, extra_items: [],
    booking_rooms: [{ room_type: 'deluxe', qty: 1, unit_price: 7000 }] },
  // Monday night stay covering Mon + Tue, 2 rooms
  { booking_number: 'B3', package_type: 'night', visit_date: '2026-09-07', check_out_date: '2026-09-09',
    nights: 2, adults: 6, children_paid: 0, children_free: 0, drivers: 0, subtotal: 60000,
    discount: 0, discount_pct: 0, total: 60000, advance_paid: 30000, status: 'checked_out',
    is_corporate: false, company_name: null, customer_phone: '01700000001', source_module: 'manual',
    created_at: '2026-08-08T06:00:00Z', package_snapshot: { name: 'Night Package' }, extra_items: [],
    booking_rooms: [{ room_type: 'deluxe', qty: 2, unit_price: 15000 }] },
  // Saturday no-show: only the advance is revenue, and it frees the room
  { booking_number: 'B4', package_type: 'daylong', visit_date: '2026-09-12', check_out_date: null,
    nights: null, adults: 10, children_paid: 0, children_free: 0, drivers: 0, subtotal: 30000,
    discount: 0, discount_pct: 0, total: 30000, advance_paid: 4000, status: 'no_show',
    is_corporate: false, company_name: null, customer_phone: '01700000003', source_module: 'manual',
    created_at: '2026-09-02T06:00:00Z', package_snapshot: { name: 'Daylong Package' }, extra_items: [],
    booking_rooms: [{ room_type: 'cottage', qty: 2, unit_price: 5000 }] },
  // Cancelled: no revenue, no occupancy
  { booking_number: 'B5', package_type: 'daylong', visit_date: '2026-09-12', check_out_date: null,
    nights: null, adults: 8, children_paid: 0, children_free: 0, drivers: 0, subtotal: 25000,
    discount: 0, discount_pct: 0, total: 25000, advance_paid: 0, status: 'cancelled',
    is_corporate: false, company_name: null, customer_phone: '01700000004', source_module: 'manual',
    created_at: '2026-09-02T06:00:00Z', package_snapshot: { name: 'Daylong Package' }, extra_items: [],
    booking_rooms: [{ room_type: 'cottage', qty: 1, unit_price: 5000 }] },
]

const EXPENSES = [
  { expense_date: '2026-09-03', amount: 12000, description: 'Fish', payment_method: 'cash',
    category: { name: 'Kitchen', category_group: 'operating' }, payee: { name: 'Bazar', payee_type: 'vendor' } },
  { expense_date: '2026-09-20', amount: 8000, description: 'Diesel', payment_method: 'cash',
    category: { name: 'Utilities', category_group: 'operating' }, payee: { name: 'Pump', payee_type: 'vendor' } },
]

const TABLES: Record<string, unknown[]> = {
  bookings:            BOOKINGS,
  expenses:            EXPENSES,
  room_inventory:      [{ room_type: 'cottage', display_name: 'Cottage', total_units: 5, daylong_only: false },
                        { room_type: 'deluxe',  display_name: 'Deluxe',  total_units: 5, daylong_only: false }],
  packages:            [{ id: 'p1', name: 'Daylong Package', type: 'daylong', is_active: true, weekday_adult: 1950, friday_adult: 2250 }],
  package_room_prices: [{ package_id: 'p1', room_type: 'cottage', price: 5000 }],
  holiday_dates:       [],
  settings:            [{ key: 'resort_name', value: 'Garden Centre Resort' }, { key: 'total_rooms', value: '10' }],
  coffee_shop_sales:   [{ sale_date: '2026-09-05', net_amount: 1500, status: 'final' },
                        { sale_date: '2026-09-06', net_amount: 999,  status: 'void' }],
  checkout_charges:    [{ amount: 2500 }],
}

/** Minimal PostgREST stand-in: every filter is a no-op, the table decides the rows. */
function stubClient() {
  return {
    from(table: string) {
      const rows = TABLES[table] ?? []
      const chain: Record<string, unknown> = {}
      for (const m of ['select', 'gte', 'lte', 'eq', 'order', 'limit']) {
        chain[m] = () => chain
      }
      chain.range = (start: number) => Promise.resolve({ data: start === 0 ? rows : [], error: null })
      chain.then = (resolve: (v: { data: unknown[]; error: null }) => unknown) =>
        resolve({ data: rows, error: null })
      return chain
    },
  }
}

vi.mock('@/lib/supabase/server', () => ({ createServiceClient: () => stubClient() }))

const { buildBusinessContext } = await import('./business-context')
const pack = await buildBusinessContext({ from: '2026-09-01', to: '2026-09-30', detail: 'full' })

describe('the business context pack', () => {
  it('counts revenue by the house rule', () => {
    // 50,000 + 15,000 + 60,000 + 4,000 (no-show advance only) + 0 (cancelled)
    expect(pack.totals.revenue).toBe(129000)
    expect(pack.totals.no_shows).toBe(1)
    expect(pack.totals.cancelled).toBe(1)
  })

  it('splits revenue by weekday — the question the pack is for', () => {
    const byDay = Object.fromEntries(pack.revenue.by_weekday.map((d: any) => [d.weekday, d]))  // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(byDay.Sat.revenue).toBe(54000)   // 50,000 + the 4,000 no-show advance
    expect(byDay.Mon.revenue).toBe(75000)   // 15,000 + 60,000
    expect(byDay.Sun.revenue).toBe(0)
    expect(byDay.Sat.guests).toBe(32)       // 22 + 10; drivers are counted separately
  })

  it('spreads a night stay across the nights it occupies', () => {
    const byDay = Object.fromEntries(pack.occupancy.by_weekday.map((d: any) => [d.weekday, d]))  // eslint-disable-line @typescript-eslint/no-explicit-any
    // Mon 07 Sep: 1 room (B2) + 2 rooms (B3) = 3 of 10 units
    expect(byDay.Mon.avg_units_sold).toBe(3)
    expect(byDay.Mon.avg_occupancy_pct).toBe(30)
    // Tue 08 Sep is the second night of B3 — 2 units, even though no booking starts then
    expect(byDay.Tue.avg_units_sold).toBe(2)
    // A no-show and a cancellation hold nothing
    expect(byDay.Sat.avg_units_sold).toBe(3)
  })

  it('reports what has already been conceded', () => {
    expect(pack.discounting.total_given).toBe(5000)
    expect(pack.discounting.bookings_discounted).toBe(1)
    expect(pack.discounting.avg_pct_when_given).toBe(25)
  })

  it('nets revenue against expenses month by month', () => {
    const sept = pack.revenue.by_month.find((m: any) => m.month === '2026-09')  // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(sept.expenses).toBe(20000)
    expect(sept.net).toBe(109000)
    expect(pack.expenses.by_category[0]).toMatchObject({ key: 'Kitchen', total: 12000 })
  })

  it('carries the levers an offer would move', () => {
    expect(pack.capacity.capacity_units_per_day).toBe(10)
    expect(pack.price_list[0]).toMatchObject({ name: 'Daylong Package', adult_weekday: 1950 })
    expect(pack.totals.coffee_shop_sales).toBe(1500)   // the void sale is excluded
    expect(pack.totals.repeat_guests).toBe(1)          // 01700000001 booked twice
  })

  it('ships every booking as columns + rows, not repeated keys', () => {
    expect(pack.bookings.columns).toContain('weekday')
    expect(pack.bookings.rows).toHaveLength(5)
    const i = pack.bookings.columns.indexOf('revenue')
    expect(pack.bookings.rows.map((r: unknown[]) => r[i])).toEqual([50000, 15000, 60000, 4000, 0])
  })

  it('leaves the detail out when only totals are asked for', async () => {
    const summary = await buildBusinessContext({ from: '2026-09-01', to: '2026-09-30', detail: 'summary' })
    expect(summary.bookings).toBeUndefined()
    expect(summary.totals.revenue).toBe(129000)
  })
})
