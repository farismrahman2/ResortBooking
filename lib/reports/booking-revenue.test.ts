import { describe, it, expect } from 'vitest'
import { bookingRevenue, sumBookingRevenue, occupiesRoom, REVENUE_STATUS_LIST } from './booking-revenue'
import { settledOutstanding } from '@/lib/queries/analytics'

/**
 * The no-show rule has now been got wrong in five separate places, in both
 * directions — counted at full value on Analytics and the dashboard, counted
 * as nothing on sales attribution and the corporate summary. These lock it.
 */
describe('bookingRevenue — the no-show rule', () => {
  it('values a no-show at the forfeited advance, never the booking total', () => {
    expect(bookingRevenue({ status: 'no_show', total: 50_000, advance_paid: 5_000 })).toBe(5_000)
  })

  it('values a no-show with no advance at zero', () => {
    expect(bookingRevenue({ status: 'no_show', total: 50_000, advance_paid: 0 })).toBe(0)
  })

  it('values confirmed and checked-out bookings at their total', () => {
    expect(bookingRevenue({ status: 'confirmed',   total: 19_000, advance_paid: 5_000 })).toBe(19_000)
    expect(bookingRevenue({ status: 'checked_out', total: 19_000, advance_paid: 5_000 })).toBe(19_000)
  })

  it('excludes cancelled bookings and unaccepted quotes entirely', () => {
    for (const status of ['cancelled', 'draft', 'sent']) {
      expect(bookingRevenue({ status, total: 50_000, advance_paid: 5_000 })).toBe(0)
    }
  })

  it('keeps no_show in the revenue status list — excluding it drops real money', () => {
    expect(REVENUE_STATUS_LIST).toContain('no_show')
    expect(REVENUE_STATUS_LIST).not.toContain('cancelled')
  })

  it('does not let a no-show occupy a room, even though it earns revenue', () => {
    expect(occupiesRoom('no_show')).toBe(false)
    expect(occupiesRoom('confirmed')).toBe(true)
  })

  it('sums a mixed set the way the reports do', () => {
    expect(sumBookingRevenue([
      { status: 'checked_out', total: 19_000, advance_paid: 5_000 },
      { status: 'no_show',     total: 50_000, advance_paid: 5_000 },
      { status: 'cancelled',   total: 30_000, advance_paid: 3_000 },
    ])).toBe(24_000)
  })
})

describe('settledOutstanding — no phantom debt', () => {
  // The exact booking that prompted this: GCR-B-2026-0711, 16 Aug 2026.
  it('reports no outstanding balance for a no-show', () => {
    const s = settledOutstanding({ status: 'no_show', total: 50_000, advance_paid: 5_000 })
    expect(s.revenue).toBe(5_000)
    expect(s.collected).toBe(5_000)
    expect(s.outstanding).toBe(0)
  })

  it('counts payments on an OPEN checkout, not just a finalized one', () => {
    const row = {
      status: 'checked_out', total: 19_000, advance_paid: 5_000,
      checkout: { status: 'draft', discount_amount: 0, charges: [], payments: [{ amount: 14_000 }] },
    }
    expect(settledOutstanding(row).collected).toBe(19_000)
    expect(settledOutstanding(row).outstanding).toBe(0)
  })

  it('ignores a voided checkout', () => {
    const row = {
      status: 'checked_out', total: 19_000, advance_paid: 5_000,
      checkout: { status: 'voided', discount_amount: 0, charges: [], payments: [{ amount: 14_000 }] },
    }
    expect(settledOutstanding(row).collected).toBe(5_000)
    expect(settledOutstanding(row).outstanding).toBe(14_000)
  })

  it('counts extras as revenue so collected can never exceed it', () => {
    const row = {
      status: 'checked_out', total: 10_000, advance_paid: 0,
      checkout: {
        status: 'finalized', discount_amount: 0,
        charges: [{ amount: 2_500 }], payments: [{ amount: 12_500 }],
      },
    }
    const s = settledOutstanding(row)
    expect(s.revenue).toBe(12_500)
    expect(s.collected).toBe(12_500)
    expect(s.outstanding).toBe(0)
  })

  it('treats a discount as a reduction in the bill, not as a debt', () => {
    // Apple Khan, 16 Aug: 5,000 bill, 1,000 discount, 4,000 paid.
    const row = {
      status: 'checked_out', total: 5_000, advance_paid: 0,
      checkout: {
        status: 'finalized', discount_amount: 1_000,
        charges: [], payments: [{ amount: 4_000 }],
      },
    }
    const s = settledOutstanding(row)
    expect(s.revenue).toBe(4_000)
    expect(s.outstanding).toBe(0)
  })
})
