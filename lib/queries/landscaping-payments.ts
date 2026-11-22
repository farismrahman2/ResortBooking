import { createClient } from '@/lib/supabase/server'

/**
 * LANDSCAPING — payment records: every payment with its payment slip, linked
 * to its approved requisition and that requisition's signed slip. The
 * signed-in user's own access (landscaping tables only).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createClient() as any
const n = (v: unknown) => Number(v ?? 0)

export interface PaymentRecord {
  id: string
  requisition_id: string
  req_no: number
  req_description: string
  req_total: number
  req_slip_path: string | null
  project_code: string | null
  supplier_name: string | null
  bill_id: string
  bill_no: string | null
  amount: number
  pay_date: string
  method: string
  reference: string | null
  note: string | null
  photo_path: string | null
  extra_photo_paths: string[]
  req_slip_extra: string[]
  created_by: string | null
  uploaded_by: string | null
  created_at: string
  updated_at: string | null
}

export interface PaymentFilter {
  /** Requisition number, e.g. "39" or "00039". */
  reqNo?: number
  from?: string
  to?: string
  min?: number
  max?: number
  /** Only payments without a slip photo yet. */
  missingSlip?: boolean
}

export async function listPaymentRecords(f: PaymentFilter = {}): Promise<PaymentRecord[]> {
  let q = db().from('ls_bill_payments')
    .select('id, amount, pay_date, method, reference, note, photo_path, extra_photo_paths, created_by, created_at, updated_at, bill:ls_bills!inner(id, bill_no, supplier:ls_suppliers(name), req:ls_requisitions!inner(id, req_no, description, total, slip_photo_path, extra_photo_paths, project:ls_projects(code)))')
    .order('pay_date', { ascending: false }).order('created_at', { ascending: false }).limit(1000)
  if (f.reqNo) q = q.eq('bill.req.req_no', f.reqNo)
  if (f.from) q = q.gte('pay_date', f.from)
  if (f.to) q = q.lte('pay_date', f.to)
  if (f.min !== undefined) q = q.gte('amount', f.min)
  if (f.max !== undefined) q = q.lte('amount', f.max)
  if (f.missingSlip) q = q.is('photo_path', null)
  const { data } = await q
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (data ?? []) as any[]
  const ids = [...new Set(rows.map((r) => r.created_by).filter(Boolean))] as string[]
  const names = new Map<string, string>()
  if (ids.length) {
    const { data: people } = await db().from('user_profiles').select('user_id, full_name').in('user_id', ids)
    for (const p of (people ?? []) as Array<{ user_id: string; full_name: string }>) names.set(p.user_id, p.full_name)
  }
  return rows.map((r) => ({
    id: r.id, requisition_id: r.bill.req.id, req_no: r.bill.req.req_no, req_description: r.bill.req.description,
    req_total: n(r.bill.req.total), req_slip_path: r.bill.req.slip_photo_path ?? null, project_code: r.bill.req.project?.code ?? null,
    supplier_name: r.bill.supplier?.name ?? null, bill_id: r.bill.id, bill_no: r.bill.bill_no,
    amount: n(r.amount), pay_date: r.pay_date, method: r.method, reference: r.reference, note: r.note, photo_path: r.photo_path, extra_photo_paths: r.extra_photo_paths ?? [], req_slip_extra: r.bill.req.extra_photo_paths ?? [],
    created_by: r.created_by, uploaded_by: r.created_by ? names.get(r.created_by) ?? null : null,
    created_at: r.created_at, updated_at: r.updated_at,
  }))
}

/** Approved requisitions for the upload form, with their open bills. */
export async function approvedForPayment() {
  const { data } = await db().from('ls_requisitions')
    .select('id, req_no, description, total, slip_photo_path, project:ls_projects(code), ls_bills(id, bill_no, amount, supplier_id, supplier:ls_suppliers(name), ls_bill_payments(amount))')
    .eq('status', 'approved').order('req_no', { ascending: false }).limit(1000)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data ?? []) as any[]).map((r) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bills = ((r.ls_bills ?? []) as any[]).map((b) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const paid = ((b.ls_bill_payments ?? []) as any[]).reduce((s, p) => s + n(p.amount), 0)
      return { id: b.id as string, bill_no: b.bill_no as string | null, supplier: (b.supplier?.name ?? '—') as string, amount: n(b.amount), due: Math.max(0, Math.round((n(b.amount) - paid) * 100) / 100) }
    })
    const paid = bills.reduce((s, b) => s + (b.amount - b.due), 0)
    return {
      id: r.id as string, req_no: r.req_no as number, description: r.description as string, total: n(r.total),
      project_code: (r.project?.code ?? null) as string | null, has_slip: !!r.slip_photo_path, paid, bills,
    }
  })
}
export type PayableRequisition = Awaited<ReturnType<typeof approvedForPayment>>[number]
