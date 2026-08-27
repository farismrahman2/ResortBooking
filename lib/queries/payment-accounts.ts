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
  /** Where advances of this tender always go (bank transfer → EBL). */
  is_advance_default?: boolean
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

/**
 * Where an advance of this tender always lands — bank transfer → EBL, bKash →
 * the merchant wallet. The agent isn't asked, because the answer never varies.
 *
 * Falls back to the only active account for the tender when no default is
 * flagged, and to null when the choice is genuinely ambiguous (two banks, no
 * default) — the caller then leaves it blank rather than guessing.
 */
export async function getAdvanceDefaultAccountId(method: string): Promise<string | null> {
  const { data, error } = await db()
    .from('payment_accounts')
    .select('id, is_advance_default')
    .eq('method', method)
    .eq('is_active', true)
  if (error) {
    if (isMissingRelation(error)) return null
    throw new Error(`[advanceDefaultAccount] ${error.message}`)
  }
  const rows = (data ?? []) as Array<{ id: string; is_advance_default?: boolean }>
  return rows.find((r) => r.is_advance_default)?.id
    ?? (rows.length === 1 ? rows[0].id : null)
}

/**
 * Active accounts for one tender. Used to decide whether a destination can be
 * demanded: if the resort hasn't configured any card terminals yet, refusing
 * card payments would strand the front desk, so the requirement only bites
 * once there is something to choose from.
 */
export async function listAccountsForMethod(method: string): Promise<PaymentAccount[]> {
  const { data, error } = await db()
    .from('payment_accounts').select('*')
    .eq('method', method).eq('is_active', true)
    .order('display_order', { ascending: true })
  if (error) {
    if (isMissingRelation(error)) return []
    throw new Error(`[accountsForMethod] ${error.message}`)
  }
  return (data ?? []) as PaymentAccount[]
}
