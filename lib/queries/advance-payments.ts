import { createClient } from '@/lib/supabase/server'
import type { AdvancePaymentRow } from '@/lib/bookings/advance-methods'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createClient() as any

export type { AdvancePaymentRow }

/** Every advance instalment against a booking, oldest first. */
export async function listAdvancePayments(bookingId: string): Promise<AdvancePaymentRow[]> {
  const { data, error } = await db()
    .from('booking_advance_payments')
    .select('*')
    .eq('booking_id', bookingId)
    .order('paid_at', { ascending: true })
  // The ledger is optional until migration 003 runs — an absent table means
  // "no instalments recorded", not a broken booking page.
  if (error) {
    if (/does not exist|42P01/i.test(error.message)) return []
    throw new Error(`[advancePayments] ${error.message}`)
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data ?? []) as any[]).map((r) => ({ ...r, amount: Number(r.amount) })) as AdvancePaymentRow[]
}
