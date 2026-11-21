import { createClient } from '@/lib/supabase/server'
import { getCurrentUserContext } from '@/lib/auth/permissions'
import {
  accountStatement, billStatus, floatBalance, projectFinancials, requisitionSpend, subProjectBudget, supplierBalance,
  nextReqNo, withSubProjects, groupSpend, lastRates, priceHistory, type AccountEntry, type BillStatus, type ProjectInputs, type RateRow,
} from '@/lib/landscaping/money'

/**
 * LANDSCAPING — reads. Every ls_ table is locked to the Landscaping module in
 * the database (migrations/landscaping-module/000), so these run with the
 * signed-in user's own access. Nothing here touches resort tables except
 * user_profiles for people's names.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createClient() as any
const n = (v: unknown) => Number(v ?? 0)

// ─── People ─────────────────────────────────────────────────────────────────

export interface LsMe {
  user_id: string; name: string; is_admin: boolean
  can_prepare: boolean; can_check: boolean; can_approve: boolean; can_pay: boolean
}

/** The signed-in person's landscaping duties. The admin can do everything. */
export async function getLsMe(): Promise<LsMe | null> {
  const ctx = await getCurrentUserContext()
  if (!ctx) return null
  const isAdmin = ctx.profile.role.slug === 'admin'
  const { data } = await db().from('ls_members').select('*').eq('user_id', ctx.user_id).maybeSingle()
  return {
    user_id: ctx.user_id, name: ctx.profile.full_name, is_admin: isAdmin,
    can_prepare: isAdmin || !!data?.can_prepare || !data,   // landscaping staff prepare unless switched off
    can_check:   isAdmin || !!data?.can_check,
    can_approve: isAdmin || !!data?.can_approve,
    can_pay:     isAdmin || !!data?.can_pay,
  }
}

export interface LsMember { user_id: string; name: string; role: string; can_prepare: boolean; can_check: boolean; can_approve: boolean; can_pay: boolean }

/** Everyone who can use Landscaping (the landscaping role and the admin), with their duties. */
export async function listLsMembers(): Promise<LsMember[]> {
  const [{ data: people }, { data: duties }] = await Promise.all([
    db().from('user_profiles').select('user_id, full_name, is_active, roles!inner(slug)').in('roles.slug', ['landscaping', 'admin']).eq('is_active', true),
    db().from('ls_members').select('*'),
  ])
  const byUser = new Map(((duties ?? []) as Array<LsMember & { user_id: string }>).map((d) => [d.user_id, d]))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((people ?? []) as any[]).map((p) => {
    const d = byUser.get(p.user_id)
    const admin = (Array.isArray(p.roles) ? p.roles[0] : p.roles)?.slug === 'admin'
    return {
      user_id: p.user_id, name: p.full_name, role: admin ? 'admin' : 'landscaping',
      can_prepare: admin || (d ? d.can_prepare : true), can_check: admin || !!d?.can_check,
      can_approve: admin || !!d?.can_approve, can_pay: admin || !!d?.can_pay,
    }
  }).sort((a, b) => a.name.localeCompare(b.name))
}

async function namesFor(ids: Array<string | null | undefined>): Promise<Map<string, string>> {
  const uniq = [...new Set(ids.filter(Boolean) as string[])]
  if (!uniq.length) return new Map()
  const { data } = await db().from('user_profiles').select('user_id, full_name').in('user_id', uniq)
  return new Map(((data ?? []) as Array<{ user_id: string; full_name: string }>).map((p) => [p.user_id, p.full_name]))
}

// ─── Pick lists: people and work categories ─────────────────────────────────

export interface LsPerson { id: string; name: string; designation: string | null; phone: string | null; is_active: boolean }
export interface LsCategory { id: string; name: string; sort_order: number; is_active: boolean }

/** Everyone involved (requested by, signed on paper, sardars) — names to pick, not logins. */
export async function listPeople(includeInactive = false): Promise<LsPerson[]> {
  let q = db().from('ls_people').select('id, name, designation, phone, is_active').order('name')
  if (!includeInactive) q = q.eq('is_active', true)
  const { data } = await q
  return (data ?? []) as LsPerson[]
}

/** What the money was for — Civil works, Trees & plants… */
export async function listWorkCategories(includeInactive = false): Promise<LsCategory[]> {
  let q = db().from('ls_work_categories').select('id, name, sort_order, is_active').order('sort_order').order('name')
  if (!includeInactive) q = q.eq('is_active', true)
  const { data } = await q
  return (data ?? []) as LsCategory[]
}

/** Every priced item line on a live requisition, with date, project and the suppliers billed. */
async function itemRateRows(): Promise<RateRow[]> {
  const { data } = await db().from('ls_requisition_items')
    .select('description, unit, unit_price, req:ls_requisitions!inner(req_no, req_date, status, project:ls_projects(code), ls_bills(supplier:ls_suppliers(name)))')
    .not('req.status', 'in', '(cancelled,rejected)').limit(5000)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data ?? []) as any[]).map((i) => ({
    description: i.description, unit: i.unit, unit_price: n(i.unit_price), date: i.req?.req_date ?? '', req_no: i.req?.req_no,
    project: i.req?.project?.code ?? null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    suppliers: [...new Set(((i.req?.ls_bills ?? []) as any[]).map((b) => b.supplier?.name).filter(Boolean))] as string[],
  }))
}

/** Last unit and rate for each item, for the requisition form to fill in. */
export async function itemSuggestions() {
  return [...lastRates(await itemRateRows()).values()].map((r) => ({ description: r.description.trim(), unit: r.unit, rate: r.unit_price, date: r.date }))
    .sort((a, b) => a.description.localeCompare(b.description))
}

/** Optional date window (yyyy-mm-dd, inclusive) for the landscaping reports. */
export interface LsRange { from?: string; to?: string }
const inRange = (d: string | null | undefined, r?: LsRange) => !r || ((!r.from || (d ?? '') >= r.from) && (!r.to || (d ?? '') <= r.to))

export async function itemPriceHistory(range?: LsRange) {
  return priceHistory((await itemRateRows()).filter((x) => inRange(x.date, range)))
}

const EXPENSE_FALLBACK: Record<string, string> = {
  labour: 'Site running (labour, food, transport)', food: 'Site running (labour, food, transport)',
  transport: 'Site running (labour, food, transport)', tools: 'Tools & equipment',
}

/**
 * Where the money went: supplier bills (by their requisition's category) plus
 * labour/food/other spending (by its own category), overall and per main
 * project (sub-projects counted in their main project). Also by requester.
 */
export async function spendAnalysis(range?: LsRange) {
  const [{ data: allBills }, { data: allExps }, { data: allReqs }, cats, projects] = await Promise.all([
    db().from('ls_bills').select('amount, bill_date, req:ls_requisitions(project_id, category_id)'),
    db().from('ls_expenses').select('amount, exp_date, category, project_id, work_category_id'),
    db().from('ls_requisitions').select('requested_by_name, req_date, total, status, ls_bills(amount)').eq('status', 'approved'),
    listWorkCategories(true), listProjects(),
  ])
  // Bills by bill date, spending by its date, requisitions by slip date.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bills = ((allBills ?? []) as any[]).filter((b) => inRange(b.bill_date, range))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const exps = ((allExps ?? []) as any[]).filter((e) => inRange(e.exp_date, range))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const reqs = ((allReqs ?? []) as any[]).filter((r) => inRange(r.req_date, range))
  const catName = new Map(cats.map((c) => [c.id, c.name]))
  const mainOf = new Map(projects.map((p) => [p.id, p.parent_id ?? p.id]))
  const label = new Map(projects.map((p) => [p.id, `${p.code} · ${p.title}`]))
  const lines: Array<{ key: string; amount: number; main: string | null }> = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const b of (bills ?? []) as any[]) {
    lines.push({ key: catName.get(b.req?.category_id) ?? 'Not set', amount: n(b.amount), main: b.req?.project_id ? mainOf.get(b.req.project_id) ?? null : null })
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const e of (exps ?? []) as any[]) {
    const key = catName.get(e.work_category_id) ?? (e.category === 'before_system' ? 'Spent before the system' : EXPENSE_FALLBACK[e.category] ?? 'Not set')
    lines.push({ key, amount: n(e.amount), main: e.project_id ? mainOf.get(e.project_id) ?? null : null })
  }
  const mains = [...new Set(lines.map((l) => l.main))]
  const byProject = mains.map((m) => ({
    project: m ? label.get(m) ?? 'Unknown project' : 'No project',
    total: lines.filter((l) => l.main === m).reduce((s, l) => s + l.amount, 0),
    rows: groupSpend(lines.filter((l) => l.main === m)),
  })).sort((a, b) => b.total - a.total)

  const byRequester = new Map<string, { name: string; count: number; approved: number; billed: number }>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const r of (reqs ?? []) as any[]) {
    const name = r.requested_by_name?.trim() || 'Not set'
    const cur = byRequester.get(name) ?? { name, count: 0, approved: 0, billed: 0 }
    cur.count += 1; cur.approved += n(r.total)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    cur.billed += ((r.ls_bills ?? []) as any[]).reduce((s, b) => s + n(b.amount), 0)
    byRequester.set(name, cur)
  }
  return {
    overall: groupSpend(lines),
    byProject,
    byRequester: [...byRequester.values()].sort((a, b) => b.approved - a.approved),
  }
}

// ─── Projects & clients ─────────────────────────────────────────────────────

export interface LsProjectRow {
  id: string; code: string; title: string; site: string | null; status: string
  contract_value: number; start_date: string | null; end_date: string | null; notes: string | null
  client_id: string | null; client_name: string | null
  /** Set on a sub-project (e.g. ASU → Parking). */
  parent_id: string | null; parent_code: string | null
  /** "ASU" or "ASU › Parking" — for pickers and lists. */
  label: string
}

export async function listProjects(): Promise<LsProjectRow[]> {
  const { data } = await db().from('ls_projects').select('*, client:ls_clients(name)').order('code')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (data ?? []) as any[]
  const codeOf = new Map(rows.map((p) => [p.id, p.code]))
  const out: LsProjectRow[] = rows.map((p) => {
    const parentCode = p.parent_id ? codeOf.get(p.parent_id) ?? null : null
    return {
      ...p, contract_value: n(p.contract_value), client_name: p.client?.name ?? null,
      parent_id: p.parent_id ?? null, parent_code: parentCode,
      label: parentCode ? `${parentCode} › ${p.code}` : p.code,
    }
  })
  // Each main project followed by its sub-projects.
  const mains = out.filter((p) => !p.parent_id)
  return [
    ...mains.flatMap((m) => [m, ...out.filter((c) => c.parent_id === m.id)]),
    ...out.filter((p) => p.parent_id && !mains.some((m) => m.id === p.parent_id)),
  ]
}

export async function listClients() {
  const { data } = await db().from('ls_clients').select('*').order('name')
  return (data ?? []) as Array<{ id: string; name: string; company: string | null; phone: string | null; email: string | null; address: string | null }>
}

/** Every project's figures at once (projects list, overview, reports). A main
 *  project's `f` includes its sub-projects; a sub-project's `f` is its own, and
 *  `budget` measures it against its own budget. */
export async function projectsWithFinancials() {
  const [projects, { data: vars }, { data: recs }, { data: reqs }, { data: exps }] = await Promise.all([
    listProjects(),
    db().from('ls_variations').select('project_id, amount'),
    db().from('ls_client_receipts').select('project_id, amount'),
    db().from('ls_requisitions').select('project_id, ls_bills(amount, ls_bill_payments(amount))').neq('status', 'cancelled'),
    db().from('ls_expenses').select('project_id, amount'),
  ])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const by = (rows: any[] | null) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const m = new Map<string | null, any[]>()
    for (const r of rows ?? []) m.set(r.project_id, [...(m.get(r.project_id) ?? []), r])
    return m
  }
  const V = by(vars), R = by(recs), Q = by(reqs), E = by(exps)
  const inputs = new Map<string, ProjectInputs>(projects.map((p) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bills = (Q.get(p.id) ?? []).flatMap((q: any) => q.ls_bills ?? [])
    return [p.id, {
      contract: p.contract_value,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      variations: (V.get(p.id) ?? []).map((v: any) => n(v.amount)),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      receipts: (R.get(p.id) ?? []).map((r: any) => n(r.amount)),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      bills: bills.map((b: any) => n(b.amount)),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      billPayments: bills.flatMap((b: any) => (b.ls_bill_payments ?? []).map((x: any) => n(x.amount))),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expenses: (E.get(p.id) ?? []).map((e: any) => n(e.amount)),
    }]
  }))
  return projects.map((p) => {
    const own = inputs.get(p.id)!
    const subs = projects.filter((c) => c.parent_id === p.id)
    const ownF = projectFinancials(own)
    return {
      ...p,
      subIds: subs.map((c) => c.id),
      ownF,
      f: subs.length ? withSubProjects(own, subs.map((c) => inputs.get(c.id)!)) : ownF,
      budget: p.parent_id ? subProjectBudget(p.contract_value, ownF.spent) : null,
    }
  })
}

export async function getProject(id: string) {
  const all = await projectsWithFinancials()
  const project = all.find((p) => p.id === id)
  if (!project) return null
  const ids = [project.id, ...project.subIds]
  const codeOf = new Map(all.map((p) => [p.id, p.code]))
  const [{ data: variations }, { data: receipts }, { data: expenses }, reqs, { data: payments }] = await Promise.all([
    db().from('ls_variations').select('*').in('project_id', ids).order('var_date', { ascending: false }),
    db().from('ls_client_receipts').select('*').in('project_id', ids).order('receipt_date', { ascending: false }),
    db().from('ls_expenses').select('*').in('project_id', ids).order('exp_date', { ascending: false }),
    listRequisitions({ projectIds: ids }),
    db().from('ls_bill_payments').select('pay_date, amount, method, reference, bill:ls_bills!inner(bill_no, supplier:ls_suppliers(name), req:ls_requisitions!inner(req_no, project_id))').in('bill.req.project_id', ids),
  ])
  const byCat = new Map<string, number>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const e of (expenses ?? []) as any[]) byCat.set(e.category, (byCat.get(e.category) ?? 0) + n(e.amount))

  // This project's account: client money in; supplier payments and labour/food/other out.
  const where = (pid: string | null) => (pid && pid !== project.id ? codeOf.get(pid) ?? null : null)
  const entries: AccountEntry[] = [
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...((receipts ?? []) as any[]).map((r) => ({ date: r.receipt_date, direction: 'in' as const, amount: n(r.amount), label: `Client payment · ${r.method}${r.reference ? ` · ${r.reference}` : ''}`, where: where(r.project_id) })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...((payments ?? []) as any[]).map((p) => ({ date: p.pay_date, direction: 'out' as const, amount: n(p.amount),
      label: `${p.bill?.supplier?.name ?? 'Supplier'} · bill ${p.bill?.bill_no ?? '—'} · Req ${String(p.bill?.req?.req_no ?? '').padStart(5, '0')} · ${p.method}`, where: where(p.bill?.req?.project_id) })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...((expenses ?? []) as any[]).map((e) => ({ date: e.exp_date, direction: 'out' as const, amount: n(e.amount),
      label: `${e.category === 'labour' ? 'Daily labour' : e.category === 'before_system' ? 'Spent before the system' : e.category[0].toUpperCase() + e.category.slice(1)}${e.workers ? ` (${e.workers} × ${n(e.rate)})` : ''}${e.description ? ` · ${e.description}` : ''}`, where: where(e.project_id) })),
  ]
  const parent = project.parent_id ? all.find((p) => p.id === project.parent_id) ?? null : null
  return {
    project, parent,
    subProjects: all.filter((p) => p.parent_id === project.id),
    variations: variations ?? [], receipts: receipts ?? [], expenses: expenses ?? [],
    requisitions: reqs, expenseByCategory: Object.fromEntries(byCat),
    account: accountStatement(entries),
  }
}

/**
 * A project's main project, looked up by parent_id. (The self-join embed in
 * PostgREST picks the sub-projects direction, so it isn't used.)
 */
async function parentLookup() {
  const { data } = await db().from('ls_projects').select('id, code, title')
  const byId = new Map(((data ?? []) as Array<{ id: string; code: string; title: string }>).map((p) => [p.id, p]))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (proj: any) => (proj?.parent_id ? byId.get(proj.parent_id) ?? null : null)
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const codeLabel = (proj: any, parent: { code: string } | null) => (proj ? (parent ? `${parent.code} › ${proj.code}` : proj.code) : null)

// ─── Requisitions ───────────────────────────────────────────────────────────

export interface LsRequisitionRow {
  id: string; req_no: number; req_date: string; department: string | null; description: string
  status: string; total: number; project_id: string | null; project_code: string | null
  requested_by_name: string | null; prepared_by: string | null
  billed: number; paid: number; overBudget: boolean; billCount: number
  /** Entered by the admin from an old paper slip. */
  from_paper: boolean
}

export async function listRequisitions(opts: { status?: string; projectId?: string; projectIds?: string[] } = {}): Promise<LsRequisitionRow[]> {
  let q = db().from('ls_requisitions')
    .select('id, req_no, req_date, department, description, status, total, project_id, requested_by_name, prepared_by, from_paper, project:ls_projects(code, parent_id), ls_bills(amount, ls_bill_payments(amount))')
    .order('req_no', { ascending: false }).limit(500)
  if (opts.status) q = q.eq('status', opts.status)
  if (opts.projectId) q = q.eq('project_id', opts.projectId)
  if (opts.projectIds) q = q.in('project_id', opts.projectIds)
  const [{ data }, parentOf] = await Promise.all([q, parentLookup()])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data ?? []) as any[]).map((r) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bills = (r.ls_bills ?? []).map((b: any) => ({ amount: n(b.amount), paid: (b.ls_bill_payments ?? []).reduce((s: number, p: any) => s + n(p.amount), 0) }))
    const s = requisitionSpend(n(r.total), bills)
    return {
      id: r.id, req_no: r.req_no, req_date: r.req_date, department: r.department, description: r.description,
      status: r.status, total: n(r.total), project_id: r.project_id, project_code: codeLabel(r.project, parentOf(r.project)),
      requested_by_name: r.requested_by_name, prepared_by: r.prepared_by,
      billed: s.billed, paid: s.paid, overBudget: s.overBudget, billCount: bills.length, from_paper: !!r.from_paper,
    }
  })
}

export interface LsBillRow {
  id: string; requisition_id: string; req_no: number | null; supplier_id: string; supplier_name: string
  bill_no: string | null; bill_date: string; amount: number; paid: number; status: BillStatus
  note: string | null; photo_path: string | null; project_code: string | null
  payments: Array<{ id: string; pay_date: string; amount: number; method: string; reference: string | null; float_holder: string | null }>
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toBill(b: any): LsBillRow {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const payments = ((b.ls_bill_payments ?? []) as any[]).map((p) => ({ ...p, amount: n(p.amount) }))
    .sort((a, c) => String(a.pay_date).localeCompare(String(c.pay_date)))
  const paid = payments.reduce((s, p) => s + p.amount, 0)
  return {
    id: b.id, requisition_id: b.requisition_id, req_no: b.req?.req_no ?? null,
    supplier_id: b.supplier_id, supplier_name: b.supplier?.name ?? '—',
    bill_no: b.bill_no, bill_date: b.bill_date, amount: n(b.amount), paid, status: billStatus(n(b.amount), paid),
    note: b.note, photo_path: b.photo_path, project_code: b.req?.project?.code ?? null, payments,
  }
}
const BILL_SELECT = '*, supplier:ls_suppliers(name), req:ls_requisitions(req_no, project:ls_projects(code)), ls_bill_payments(*)'

export async function getRequisition(id: string) {
  const [{ data: req }, { data: items }, { data: bills }] = await Promise.all([
    db().from('ls_requisitions').select('*, project:ls_projects(id, code, title, site, parent_id)').eq('id', id).maybeSingle(),
    db().from('ls_requisition_items').select('*').eq('requisition_id', id).order('line_no'),
    db().from('ls_bills').select(BILL_SELECT).eq('requisition_id', id).order('bill_date'),
  ])
  if (!req) return null
  if (req.project) req.project.parent = (await parentLookup())(req.project)
  const billRows = ((bills ?? []) as unknown[]).map(toBill)
  const names = await namesFor([req.prepared_by, req.checked_by, req.approved_by, req.rejected_by])
  return {
    req: { ...req, total: n(req.total) },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    items: ((items ?? []) as any[]).map((i) => ({ ...i, qty: n(i.qty), unit_price: n(i.unit_price), amount: n(i.amount) })),
    bills: billRows,
    spend: requisitionSpend(n(req.total), billRows.map((b) => ({ amount: b.amount, paid: b.paid }))),
    names: {
      prepared: names.get(req.prepared_by) ?? null, checked: names.get(req.checked_by) ?? null,
      approved: names.get(req.approved_by) ?? null, rejected: names.get(req.rejected_by) ?? null,
    },
  }
}

export async function nextRequisitionNo(): Promise<number> {
  const { data } = await db().from('ls_requisitions').select('req_no').order('req_no', { ascending: false }).limit(1)
  return nextReqNo(data?.[0]?.req_no ?? null)
}

/** Requisition numbers already taken, with their status — so the form can warn before saving. */
export async function usedRequisitionNos(): Promise<Array<{ req_no: number; status: string }>> {
  const { data } = await db().from('ls_requisitions').select('req_no, status').order('req_no').limit(5000)
  return (data ?? []) as Array<{ req_no: number; status: string }>
}

/** Approved requisitions that can take bills. */
export async function approvedRequisitions() {
  const { data } = await db().from('ls_requisitions').select('id, req_no, description, total, project:ls_projects(code, parent_id)').eq('status', 'approved').order('req_no', { ascending: false })
  const parentOf = await parentLookup()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data ?? []) as any[]).map((r) => ({ id: r.id, req_no: r.req_no, description: r.description, total: n(r.total),
    project_code: codeLabel(r.project, parentOf(r.project)) }))
}

// ─── Bills & suppliers ──────────────────────────────────────────────────────

export async function listBills(opts: { status?: BillStatus; supplierId?: string } = {}): Promise<LsBillRow[]> {
  let q = db().from('ls_bills').select(BILL_SELECT).order('bill_date', { ascending: false }).limit(1000)
  if (opts.supplierId) q = q.eq('supplier_id', opts.supplierId)
  const { data } = await q
  const rows = ((data ?? []) as unknown[]).map(toBill)
  return opts.status ? rows.filter((b) => b.status === opts.status) : rows
}

export async function listSuppliers() {
  const [{ data: sups }, bills] = await Promise.all([
    db().from('ls_suppliers').select('*').order('name'),
    listBills(),
  ])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((sups ?? []) as any[]).map((s) => {
    const mine = bills.filter((b) => b.supplier_id === s.id)
    return { ...s, ...supplierBalance(n(s.opening_balance), mine.map((b) => b.amount), mine.map((b) => b.paid)), bills: mine.length }
  })
}

export async function getSupplierLedger(id: string) {
  const [{ data: s }, bills] = await Promise.all([
    db().from('ls_suppliers').select('*').eq('id', id).maybeSingle(),
    listBills({ supplierId: id }),
  ])
  if (!s) return null
  // Running ledger: bills (+) and payments (−) in date order.
  const lines = [
    ...bills.map((b) => ({ date: b.bill_date, kind: 'bill' as const, ref: `Bill ${b.bill_no ?? ''} · Req ${b.req_no ?? '—'}`.trim(), debit: b.amount, credit: 0, billId: b.id })),
    ...bills.flatMap((b) => b.payments.map((p) => ({ date: p.pay_date, kind: 'payment' as const, ref: `Paid ${p.method}${p.reference ? ` · ${p.reference}` : ''} (bill ${b.bill_no ?? ''})`, debit: 0, credit: p.amount, billId: b.id }))),
  ].sort((a, b) => a.date.localeCompare(b.date) || (a.kind === 'bill' ? -1 : 1))
  let bal = n(s.opening_balance)
  const ledger = lines.map((l) => { bal += l.debit - l.credit; return { ...l, balance: Math.round(bal * 100) / 100 } })
  return { supplier: s, bills, ledger, ...supplierBalance(n(s.opening_balance), bills.map((b) => b.amount), bills.map((b) => b.paid)) }
}

// ─── Cash floats & direct spending ──────────────────────────────────────────

export async function cashFloats() {
  const [members, { data: moves }, { data: pays }, { data: exps }] = await Promise.all([
    listLsMembers(),
    db().from('ls_cash_movements').select('*').order('mov_date', { ascending: false }),
    db().from('ls_bill_payments').select('float_holder, amount').not('float_holder', 'is', null),
    db().from('ls_expenses').select('float_holder, amount').not('float_holder', 'is', null),
  ])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const M = (moves ?? []) as any[], P = (pays ?? []) as any[], E = (exps ?? []) as any[]
  const holders = new Set<string>([...members.filter((m) => m.can_pay).map((m) => m.user_id), ...M.map((m) => m.holder)])
  const names = await namesFor([...holders])
  return {
    floats: [...holders].map((h) => ({
      holder: h, name: names.get(h) ?? 'Unknown',
      ...floatBalance({
        given: M.filter((m) => m.holder === h && m.kind === 'given').map((m) => n(m.amount)),
        returned: M.filter((m) => m.holder === h && m.kind === 'returned').map((m) => n(m.amount)),
        paidBills: P.filter((p) => p.float_holder === h).map((p) => n(p.amount)),
        expenses: E.filter((e) => e.float_holder === h).map((e) => n(e.amount)),
      }),
    })).sort((a, b) => a.name.localeCompare(b.name)),
    movements: M.slice(0, 100).map((m) => ({ ...m, amount: n(m.amount), holder_name: names.get(m.holder) ?? 'Unknown' })),
  }
}

export async function listExpenses(opts: { projectId?: string; category?: string } = {}) {
  let q = db().from('ls_expenses').select('*, project:ls_projects(code)').order('exp_date', { ascending: false }).limit(500)
  if (opts.projectId) q = q.eq('project_id', opts.projectId)
  if (opts.category) q = q.eq('category', opts.category)
  const { data } = await q
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (data ?? []) as any[]
  const names = await namesFor(rows.map((r) => r.float_holder))
  return rows.map((r) => ({ ...r, amount: n(r.amount), project_code: r.project?.code ?? null, holder_name: r.float_holder ? names.get(r.float_holder) ?? null : null }))
}

// ─── Overview & reports ─────────────────────────────────────────────────────

export async function landscapingOverview(me: LsMe | null) {
  const monthStart = new Date().toISOString().slice(0, 8) + '01'
  const [reqs, bills, { floats }, projects, { data: recs }, { data: exps }] = await Promise.all([
    listRequisitions(), listBills(), cashFloats(), projectsWithFinancials(),
    db().from('ls_client_receipts').select('amount').gte('receipt_date', monthStart),
    db().from('ls_expenses').select('amount').gte('exp_date', monthStart),
  ])
  const sum = (xs: Array<{ amount: unknown }> | null) => (xs ?? []).reduce((s, x) => s + n(x.amount), 0)
  const paidThisMonth = bills.flatMap((b) => b.payments).filter((p) => p.pay_date >= monthStart).reduce((s, p) => s + p.amount, 0)
  return {
    toCheck:   me && (me.can_check || me.is_admin) ? reqs.filter((r) => r.status === 'submitted' && r.prepared_by !== me.user_id) : [],
    toApprove: me && (me.can_approve || me.is_admin) ? reqs.filter((r) => r.status === 'checked' && r.prepared_by !== me.user_id) : [],
    overBudget: reqs.filter((r) => r.overBudget),
    unpaidBills: bills.filter((b) => b.status !== 'paid'),
    unpaidTotal: bills.reduce((s, b) => s + (b.amount - b.paid), 0),
    floats,
    projects: projects.filter((p) => p.status === 'active' && !p.parent_id),
    moneyInMonth: sum(recs),
    moneyOutMonth: paidThisMonth + sum(exps),
  }
}

/** Month-by-month money in and out (cash basis). */
export async function monthlyPnl(range?: LsRange) {
  const [{ data: allRecs }, { data: allPays }, { data: allExps }] = await Promise.all([
    db().from('ls_client_receipts').select('receipt_date, amount'),
    db().from('ls_bill_payments').select('pay_date, amount'),
    db().from('ls_expenses').select('exp_date, amount, category'),
  ])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recs = ((allRecs ?? []) as any[]).filter((r) => inRange(r.receipt_date, range))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pays = ((allPays ?? []) as any[]).filter((p) => inRange(p.pay_date, range))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const exps = ((allExps ?? []) as any[]).filter((e) => inRange(e.exp_date, range))
  const months = new Map<string, { month: string; moneyIn: number; bills: number; labour: number; food: number; other: number }>()
  const at = (d: string) => {
    const k = String(d).slice(0, 7)
    if (!months.has(k)) months.set(k, { month: k, moneyIn: 0, bills: 0, labour: 0, food: 0, other: 0 })
    return months.get(k)!
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const r of (recs ?? []) as any[]) at(r.receipt_date).moneyIn += n(r.amount)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const p of (pays ?? []) as any[]) at(p.pay_date).bills += n(p.amount)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const e of (exps ?? []) as any[]) {
    const m = at(e.exp_date)
    if (e.category === 'labour') m.labour += n(e.amount); else if (e.category === 'food') m.food += n(e.amount); else m.other += n(e.amount)
  }
  return [...months.values()].sort((a, b) => b.month.localeCompare(a.month))
    .map((m) => ({ ...m, moneyOut: m.bills + m.labour + m.food + m.other, net: m.moneyIn - (m.bills + m.labour + m.food + m.other) }))
}
