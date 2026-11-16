import { createClient } from '@/lib/supabase/server'
import { listExpenses } from '@/lib/queries/landscaping'

/**
 * LANDSCAPING — extra reads for the projects / cash pages. Same access rules
 * as lib/queries/landscaping.ts (the signed-in user's own access).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createClient() as any
const n = (v: unknown) => Number(v ?? 0)

/**
 * Labour / food / other spending, optionally only what came out of one
 * person's cash in hand (float_holder). Same row shape as listExpenses().
 */
export async function listExpensesForHolder(holder?: string | null, holderName?: string | null) {
  if (!holder) return listExpenses()
  const { data } = await db().from('ls_expenses').select('*, project:ls_projects(code)')
    .eq('float_holder', holder).order('exp_date', { ascending: false }).limit(500)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (data ?? []) as any[]
  return rows.map((r) => ({ ...r, amount: n(r.amount), project_code: r.project?.code ?? null, holder_name: holderName ?? null }))
}
