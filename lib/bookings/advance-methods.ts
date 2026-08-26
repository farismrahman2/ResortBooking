/**
 * Advance-payment vocabulary, shared by the server query and the client
 * ledger panel. Kept out of lib/queries/* because that file imports the
 * Supabase server client — pulling it into a 'use client' component drags
 * server-only code into the browser bundle and the build fails.
 */

export const ADVANCE_METHODS = [
  'bkash', 'bank_transfer', 'cash', 'nagad', 'rocket', 'card', 'other',
] as const
export type AdvanceMethod = typeof ADVANCE_METHODS[number]

export const ADVANCE_METHOD_LABEL: Record<AdvanceMethod, string> = {
  bkash: 'bKash', bank_transfer: 'Bank transfer', cash: 'Cash',
  nagad: 'Nagad', rocket: 'Rocket', card: 'Card', other: 'Other',
}

export interface AdvancePaymentRow {
  id:         string
  booking_id: string
  amount:     number
  method:     AdvanceMethod
  /** When the money actually arrived — date and time. */
  paid_at:    string
  reference:  string | null
  notes:      string | null
  created_at: string
}
