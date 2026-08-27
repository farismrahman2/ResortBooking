import { createClient } from '@/lib/supabase/server'
import { isMissingRelation } from '@/lib/supabase/errors'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createClient() as any

export interface PaymentAccount {
  id:            string
  display_name:  string
  method:        string
  account_ref:   string | null
  bank_name:     string | null
  notes:         string | null
  is_active:     boolean
  display_order: number
}

/**
 * The resort's own destinations for money — bank accounts, wallets, POS
 * terminals, the cash drawer. Empty (not an error) until migration 004 runs.
 */
export async function listPaymentAccounts(includeInactive = false): Promise<PaymentAccount[]> {
  let q = db().from('payment_accounts').select('*')
    .order('display_order', { ascending: true })
    .order('display_name', { ascending: true })
  if (!includeInactive) q = q.eq('is_active', true)
  const { data, error } = await q
  if (error) {
    if (isMissingRelation(error)) return []
    throw new Error(`[paymentAccounts] ${error.message}`)
  }
  return (data ?? []) as PaymentAccount[]
}
