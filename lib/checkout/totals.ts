import type { CheckoutChargeRow, CheckoutPaymentRow } from '@/lib/supabase/types'

/**
 * Pure helpers for computing checkout totals. The DB has a generated `net_due`
 * column on `checkouts` but we still need to recompute on the client / in
 * actions for previews and the finalize snapshot.
 */

function r2(n: number): number {
  return Math.round(n * 100) / 100
}

export function calcChargesTotal(charges: Array<Pick<CheckoutChargeRow, 'amount' | 'quantity' | 'unit_price'>>): number {
  let total = 0
  for (const c of charges) {
    const amt = c.amount !== undefined && c.amount !== null
      ? Number(c.amount)
      : Number(c.quantity ?? 0) * Number(c.unit_price ?? 0)
    total += amt
  }
  return r2(total)
}

export function calcPaymentsTotal(payments: Array<Pick<CheckoutPaymentRow, 'amount'>>): number {
  let total = 0
  for (const p of payments) total += Number(p.amount ?? 0)
  return r2(total)
}

/**
 * Total amount the guest owes BEFORE advance and at-checkout payments are subtracted.
 * Includes the original booking total (the night/daylong charge) PLUS any
 * checkout charges (food, beverage, damage, etc.) MINUS any discount applied.
 */
export function calcTotalDue(args: {
  bookingTotal:  number
  chargesTotal:  number
  discountAmount?: number
}): number {
  return r2(Number(args.bookingTotal ?? 0) + Number(args.chargesTotal ?? 0) - Number(args.discountAmount ?? 0))
}

/**
 * net_due > 0  → guest still owes (Remaining Due)
 * net_due === 0 → settled
 * net_due < 0  → resort owes guest (Refund Due — use Math.abs for display)
 *
 * Formula: (booking.total + checkout_charges - discount) - (advance_paid + checkout_payments)
 */
export function calcNetDue(args: {
  bookingTotal:    number
  chargesTotal:    number
  advance:         number
  paymentsTotal:   number
  discountAmount?: number
}): number {
  const totalDue = calcTotalDue({
    bookingTotal:   args.bookingTotal,
    chargesTotal:   args.chargesTotal,
    discountAmount: args.discountAmount ?? 0,
  })
  return r2(totalDue - Number(args.advance ?? 0) - Number(args.paymentsTotal ?? 0))
}
