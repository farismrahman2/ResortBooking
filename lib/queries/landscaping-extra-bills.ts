import { createClient } from '@/lib/supabase/server'
import { listRequisitions, type LsBillRow, type LsMe } from '@/lib/queries/landscaping'
import { floatBalance, formatReqNo } from '@/lib/landscaping/money'

/**
 * LANDSCAPING — extra reads for the bills / suppliers / overview pages. Same
 * access rules as lib/queries/landscaping.ts (the signed-in user's own access).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createClient() as any
const n = (v: unknown) => Number(v ?? 0)

export interface LsBillableRequisition {
  id: string; req_no: number; description: string; total: number; project_code: string | null
  billed: number
  /** Approved total minus what is already billed (can go below 0). */
  left: number
}

/** Approved requisitions that can take bills, with how much is still left to bill on each. */
export async function billableRequisitions(): Promise<LsBillableRequisition[]> {
  const rows = await listRequisitions({ status: 'approved' })
  return rows.map((r) => ({
    id: r.id, req_no: r.req_no, description: r.description, total: r.total, project_code: r.project_code,
    billed: r.billed, left: Math.round((r.total - r.billed) * 100) / 100,
  }))
}

/** Cash the signed-in payer should be holding (given − returned − spent). Null when not a payer. */
export async function myCashInHand(me: LsMe | null): Promise<number | null> {
  if (!me || !(me.can_pay || me.is_admin)) return null
  const [{ data: moves }, { data: pays }, { data: exps }] = await Promise.all([
    db().from('ls_cash_movements').select('kind, amount').eq('holder', me.user_id),
    db().from('ls_bill_payments').select('amount').eq('float_holder', me.user_id),
    db().from('ls_expenses').select('amount').eq('float_holder', me.user_id),
  ])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const M = (moves ?? []) as any[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const amounts = (xs: any[] | null) => (xs ?? []).map((x) => n(x.amount))
  return floatBalance({
    given: M.filter((m) => m.kind === 'given').map((m) => n(m.amount)),
    returned: M.filter((m) => m.kind === 'returned').map((m) => n(m.amount)),
    paidBills: amounts(pays), expenses: amounts(exps),
  }).balance
}

export interface LsMyRequisition { id: string; req_no: number; description: string; total: number; status: string; req_date: string }

/** The signed-in person's own requisitions that need them: sent back, and still drafts. */
export async function myOpenRequisitions(me: LsMe | null): Promise<{ sentBack: LsMyRequisition[]; drafts: LsMyRequisition[] }> {
  if (!me) return { sentBack: [], drafts: [] }
  const { data } = await db().from('ls_requisitions')
    .select('id, req_no, description, total, status, req_date')
    .eq('prepared_by', me.user_id).in('status', ['draft', 'rejected'])
    .order('req_no', { ascending: false }).limit(50)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = ((data ?? []) as any[]).map((r) => ({ id: r.id, req_no: r.req_no, description: r.description ?? '', total: n(r.total), status: r.status, req_date: r.req_date }))
  return { sentBack: rows.filter((r) => r.status === 'rejected'), drafts: rows.filter((r) => r.status === 'draft') }
}

/** Server-side search over bills: supplier name, bill no. or requisition no. */
export function searchBills(bills: LsBillRow[], q: string | undefined): LsBillRow[] {
  const term = (q ?? '').trim().toLowerCase()
  if (!term) return bills
  // "45", "00045", "req 45", "#45" → requisition number 45
  const reqMatch = term.match(/^(?:req\.?\s*)?#?\s*(\d+)$/)
  const reqNo = reqMatch ? Number(reqMatch[1]) : null
  return bills.filter((b) => {
    if (b.supplier_name.toLowerCase().includes(term)) return true
    if ((b.bill_no ?? '').toLowerCase().includes(term)) return true
    if (b.req_no != null) {
      if (formatReqNo(b.req_no).includes(term)) return true
      if (reqNo !== null && b.req_no === reqNo) return true
    }
    return false
  })
}

/** Just supplier ids and names (for pickers) — cheaper than listSuppliers(). */
export async function supplierNames(): Promise<Array<{ id: string; name: string }>> {
  const { data } = await db().from('ls_suppliers').select('id, name').order('name')
  return (data ?? []) as Array<{ id: string; name: string }>
}
