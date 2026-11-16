'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/permissions'
import { flagAlert } from '@/lib/auth/alerts'
import { getLsMe, getRequisition, nextRequisitionNo, type LsMe } from '@/lib/queries/landscaping'
import { canActOnRequisition, formatReqNo, lineAmount, requisitionSpend, requisitionTotal } from '@/lib/landscaping/money'
import { formatBDT } from '@/lib/formatters/currency'
import type { ActionResult, ActionData } from './types'

/**
 * LANDSCAPING — writes. Two gates on every action: the Landscaping module
 * permission (also enforced by the database on every ls_ table) and the
 * person's duty from Landscaping → Team (prepare / check / approve / pay).
 * The admin holds every duty.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createClient() as any
const METHODS = ['cash', 'bkash', 'bank', 'cheque'] as const
type Method = typeof METHODS[number]
const todayIso = () => new Date(Date.now() + 6 * 3600_000).toISOString().slice(0, 10)   // Dhaka date

async function gate(duty?: 'prepare' | 'check' | 'approve' | 'pay' | 'admin'): Promise<LsMe | string> {
  await requirePermission('landscaping', 'write')
  const me = await getLsMe()
  if (!me) return 'Not signed in'
  if (duty === 'admin' && !me.is_admin) return 'Only the admin can do this.'
  if (duty === 'prepare' && !me.can_prepare) return 'You are not set to prepare requisitions.'
  if (duty === 'check' && !me.can_check) return 'You are not set as a checker.'
  if (duty === 'approve' && !me.can_approve) return 'You are not set as an approver.'
  if (duty === 'pay' && !me.can_pay) return 'You are not set to make payments.'
  return me
}
const fail = (error: string) => ({ success: false as const, error })
const money = (v: unknown) => Math.round(Number(v ?? 0) * 100) / 100
const refresh = (...paths: string[]) => { for (const p of ['/landscaping', ...paths]) revalidatePath(p) }

// ─── Requisitions ───────────────────────────────────────────────────────────

export interface RequisitionInput {
  id?: string
  req_no?: number
  project_id: string | null
  req_date: string
  department?: string | null
  description: string
  area_note?: string | null
  remarks?: string | null
  requested_by_name?: string | null
  items: Array<{ description: string; qty: number; unit?: string | null; unit_price: number }>
  submit?: boolean
}

/** Create or edit a requisition (draft or sent back), optionally submitting it for checking. */
export async function saveRequisition(input: RequisitionInput): Promise<ActionData<{ id: string }>> {
  const me = await gate('prepare'); if (typeof me === 'string') return fail(me)
  const items = (input.items ?? []).filter((i) => i.description.trim() && Number(i.qty) > 0)
  if (!input.description?.trim()) return fail('Add a description')
  if (items.length === 0) return fail('Add at least one item')
  if (items.some((i) => Number(i.unit_price) < 0)) return fail('Prices cannot be negative')
  const total = requisitionTotal(items)

  const header = {
    project_id: input.project_id || null, req_date: input.req_date || todayIso(),
    department: input.department?.trim() || null, description: input.description.trim(),
    area_note: input.area_note?.trim() || null, remarks: input.remarks?.trim() || null,
    requested_by_name: input.requested_by_name?.trim() || null, total,
    ...(input.submit ? { status: 'submitted', submitted_at: new Date().toISOString() } : {}),
  }

  let id = input.id
  if (id) {
    const { data: cur } = await db().from('ls_requisitions').select('status, prepared_by').eq('id', id).maybeSingle()
    if (!cur) return fail('Requisition not found')
    if (!['draft', 'rejected'].includes(cur.status)) return fail('Only a draft or a sent-back requisition can be edited')
    if (cur.prepared_by !== me.user_id && !me.is_admin) return fail('Only the person who prepared it can edit it')
    const { error } = await db().from('ls_requisitions').update({
      ...header, ...(input.submit ? {} : { status: 'draft' }),
      checked_by: null, checked_at: null, rejected_by: null, rejected_at: null, reject_note: null, updated_at: new Date().toISOString(),
    }).eq('id', id)
    if (error) return fail(error.message)
    const { error: delErr } = await db().from('ls_requisition_items').delete().eq('requisition_id', id)
    if (delErr) return fail(delErr.message)
  } else {
    const reqNo = Number(input.req_no) > 0 ? Math.floor(Number(input.req_no)) : await nextRequisitionNo()
    const { data, error } = await db().from('ls_requisitions').insert({ ...header, req_no: reqNo, prepared_by: me.user_id }).select('id').single()
    if (error) return fail(/duplicate|unique/i.test(error.message) ? `Requisition no. ${formatReqNo(reqNo)} is already used` : error.message)
    id = data.id as string
  }
  const { error: itemErr } = await db().from('ls_requisition_items').insert(items.map((i, k) => ({
    requisition_id: id, line_no: k + 1, description: i.description.trim(), qty: Number(i.qty),
    unit: i.unit?.trim() || null, unit_price: Number(i.unit_price), amount: lineAmount(i),
  })))
  if (itemErr) return fail(itemErr.message)
  refresh('/landscaping/requisitions', `/landscaping/requisitions/${id}`)
  return { success: true, data: { id: id! } }
}

export async function submitRequisition(id: string): Promise<ActionResult> {
  const me = await gate('prepare'); if (typeof me === 'string') return fail(me)
  const { data: cur } = await db().from('ls_requisitions').select('status, prepared_by').eq('id', id).maybeSingle()
  if (!cur || !['draft', 'rejected'].includes(cur.status)) return fail('Only a draft can be submitted')
  const { error } = await db().from('ls_requisitions').update({ status: 'submitted', submitted_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', id)
  if (error) return fail(error.message)
  refresh('/landscaping/requisitions', `/landscaping/requisitions/${id}`)
  return { success: true }
}

/** Check (submitted → checked) or approve (checked → approved). Never your own. */
export async function advanceRequisition(id: string, step: 'check' | 'approve'): Promise<ActionResult> {
  const me = await gate(); if (typeof me === 'string') return fail(me)
  const { data: req } = await db().from('ls_requisitions').select('status, prepared_by, checked_by').eq('id', id).maybeSingle()
  if (!req) return fail('Requisition not found')
  const ok = canActOnRequisition(step, req, me)
  if (!ok.ok) return fail(ok.reason)
  const now = new Date().toISOString()
  const patch = step === 'check'
    ? { status: 'checked', checked_by: me.user_id, checked_at: now, updated_at: now }
    : { status: 'approved', approved_by: me.user_id, approved_at: now, updated_at: now }
  const { error } = await db().from('ls_requisitions').update(patch).eq('id', id).eq('status', req.status)
  if (error) return fail(error.message)
  refresh('/landscaping/requisitions', `/landscaping/requisitions/${id}`)
  return { success: true }
}

/** Send back for changes, with a note (checker or approver). */
export async function rejectRequisition(id: string, note: string): Promise<ActionResult> {
  const me = await gate(); if (typeof me === 'string') return fail(me)
  if (!note.trim()) return fail('Say what needs changing')
  const { data: req } = await db().from('ls_requisitions').select('status, prepared_by').eq('id', id).maybeSingle()
  if (!req || !['submitted', 'checked'].includes(req.status)) return fail('Only a requisition waiting for check or approval can be sent back')
  if (req.prepared_by === me.user_id && !me.is_admin) return fail('You prepared this one')
  if (!(me.can_check || me.can_approve || me.is_admin)) return fail('You are not a checker or approver')
  const { error } = await db().from('ls_requisitions').update({
    status: 'rejected', rejected_by: me.user_id, rejected_at: new Date().toISOString(), reject_note: note.trim(), updated_at: new Date().toISOString(),
  }).eq('id', id)
  if (error) return fail(error.message)
  refresh('/landscaping/requisitions', `/landscaping/requisitions/${id}`)
  return { success: true }
}

export async function cancelRequisition(id: string): Promise<ActionResult> {
  const me = await gate(); if (typeof me === 'string') return fail(me)
  const { data: req } = await db().from('ls_requisitions').select('status, prepared_by, ls_bills(id)').eq('id', id).maybeSingle()
  if (!req) return fail('Requisition not found')
  if ((req.ls_bills ?? []).length) return fail('This requisition already has bills — it cannot be cancelled')
  if (req.prepared_by !== me.user_id && !me.is_admin) return fail('Only the person who prepared it, or the admin, can cancel it')
  const { error } = await db().from('ls_requisitions').update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('id', id)
  if (error) return fail(error.message)
  refresh('/landscaping/requisitions', `/landscaping/requisitions/${id}`)
  return { success: true }
}

// ─── Suppliers, bills, payments ─────────────────────────────────────────────

export async function saveSupplier(input: { id?: string; name: string; phone?: string; address?: string; opening_balance?: number; notes?: string }): Promise<ActionData<{ id: string }>> {
  const me = await gate(); if (typeof me === 'string') return fail(me)
  if (!input.name?.trim()) return fail('Supplier name is required')
  const row = { name: input.name.trim(), phone: input.phone?.trim() || null, address: input.address?.trim() || null, notes: input.notes?.trim() || null }
  // Opening dues change what the business owes — admin or payer only.
  const withOpening = (me.is_admin || me.can_pay) && input.opening_balance !== undefined ? { opening_balance: money(input.opening_balance) } : {}
  const res = input.id
    ? await db().from('ls_suppliers').update({ ...row, ...withOpening }).eq('id', input.id).select('id').single()
    : await db().from('ls_suppliers').insert({ ...row, ...withOpening }).select('id').single()
  if (res.error) return fail(/duplicate|unique/i.test(res.error.message) ? 'A supplier with that name already exists' : res.error.message)
  refresh('/landscaping/suppliers', '/landscaping/bills')
  return { success: true, data: { id: res.data.id } }
}

/** A supplier's bill/challan against an approved requisition. */
export async function addBill(input: {
  requisition_id: string; supplier_id?: string; new_supplier?: string
  bill_no?: string; bill_date: string; amount: number; note?: string; photo_path?: string | null
}): Promise<ActionData<{ id: string; overBy: number }>> {
  const me = await gate(); if (typeof me === 'string') return fail(me)
  if (!(me.can_prepare || me.can_pay || me.is_admin)) return fail('You are not set to record bills')
  const amount = money(input.amount)
  if (amount <= 0) return fail('Enter the bill amount')
  const { data: req } = await db().from('ls_requisitions').select('id, req_no, status, total, description').eq('id', input.requisition_id).maybeSingle()
  if (!req) return fail('Requisition not found')
  if (req.status !== 'approved') return fail('Bills can only be added to an approved requisition')

  let supplierId = input.supplier_id
  if (!supplierId && input.new_supplier?.trim()) {
    const s = await saveSupplier({ name: input.new_supplier })
    if (!s.success) return fail(s.error)
    supplierId = s.data.id
  }
  if (!supplierId) return fail('Pick or add the supplier')

  const { data, error } = await db().from('ls_bills').insert({
    requisition_id: req.id, supplier_id: supplierId, bill_no: input.bill_no?.trim() || null,
    bill_date: input.bill_date || todayIso(), amount, note: input.note?.trim() || null, photo_path: input.photo_path || null,
  }).select('id').single()
  if (error) return fail(error.message)

  // Over the approved amount? Tell the admin.
  const full = await getRequisition(req.id)
  const spend = full ? full.spend : requisitionSpend(Number(req.total), [])
  if (spend.overBudget) {
    await flagAlert({
      event_type: 'landscaping_over_budget', entity_type: 'ls_requisition', entity_id: req.id,
      summary: `Landscaping Req ${formatReqNo(req.req_no)} billed ${formatBDT(spend.billed)} against ${formatBDT(spend.approved)} approved (over by ${formatBDT(spend.overBy)}) — ${req.description}`,
      payload: { billed: spend.billed, approved: spend.approved, over_by: spend.overBy }, created_by: me.user_id,
    })
  }
  refresh('/landscaping/bills', `/landscaping/requisitions/${req.id}`, '/landscaping/suppliers')
  return { success: true, data: { id: data.id, overBy: spend.overBy } }
}

/** Pay a bill in full or in part. Cash can come out of the payer's float. */
export async function payBill(input: { bill_id: string; amount: number; pay_date: string; method: Method; reference?: string; from_float?: boolean }): Promise<ActionResult> {
  const me = await gate('pay'); if (typeof me === 'string') return fail(me)
  if (!METHODS.includes(input.method)) return fail('Pick how it was paid')
  const amount = money(input.amount)
  if (amount <= 0) return fail('Enter the amount paid')
  const { data: bill } = await db().from('ls_bills').select('id, amount, requisition_id, supplier_id, ls_bill_payments(amount)').eq('id', input.bill_id).maybeSingle()
  if (!bill) return fail('Bill not found')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const paid = ((bill.ls_bill_payments ?? []) as any[]).reduce((s, p) => s + Number(p.amount), 0)
  const due = money(Number(bill.amount) - paid)
  if (amount > due + 0.005) return fail(`Only ${formatBDT(due)} is still due on this bill`)
  const { error } = await db().from('ls_bill_payments').insert({
    bill_id: bill.id, amount, pay_date: input.pay_date || todayIso(), method: input.method, reference: input.reference?.trim() || null,
    float_holder: input.method === 'cash' && input.from_float !== false ? me.user_id : null,
  })
  if (error) return fail(error.message)
  refresh('/landscaping/bills', `/landscaping/requisitions/${bill.requisition_id}`, '/landscaping/suppliers', `/landscaping/suppliers/${bill.supplier_id}`, '/landscaping/cash')
  return { success: true }
}

/** Admin correction: remove a payment entered by mistake (logged). */
export async function removeBillPayment(paymentId: string): Promise<ActionResult> {
  const me = await gate('admin'); if (typeof me === 'string') return fail(me)
  const { data: p } = await db().from('ls_bill_payments').select('*, bill:ls_bills(bill_no, requisition_id)').eq('id', paymentId).maybeSingle()
  if (!p) return fail('Payment not found')
  const { error } = await db().from('ls_bill_payments').delete().eq('id', paymentId)
  if (error) return fail(error.message)
  await flagAlert({
    event_type: 'landscaping_money_changed', entity_type: 'ls_bill_payment', entity_id: paymentId,
    summary: `Landscaping payment removed: ${formatBDT(Number(p.amount))} on bill ${p.bill?.bill_no ?? ''} (${p.pay_date})`,
    payload: { amount: Number(p.amount), method: p.method }, created_by: me.user_id,
  })
  refresh('/landscaping/bills', `/landscaping/requisitions/${p.bill?.requisition_id}`, '/landscaping/suppliers', '/landscaping/cash')
  return { success: true }
}

// ─── Cash floats & direct spending ──────────────────────────────────────────

/** Cash handed to an accountant from the drawer, or handed back. Admin only. */
export async function recordCash(input: { holder: string; kind: 'given' | 'returned'; amount: number; mov_date: string; note?: string }): Promise<ActionResult> {
  const me = await gate('admin'); if (typeof me === 'string') return fail(me)
  const amount = money(input.amount)
  if (amount <= 0) return fail('Enter the amount')
  if (!['given', 'returned'].includes(input.kind)) return fail('Given or returned?')
  const { error } = await db().from('ls_cash_movements').insert({
    holder: input.holder, kind: input.kind, amount, mov_date: input.mov_date || todayIso(), note: input.note?.trim() || null,
  })
  if (error) return fail(error.message)
  refresh('/landscaping/cash')
  return { success: true }
}

/** Daily labour, food, transport, tools or other — paid from the payer's float or by bKash/bank. */
export async function addExpense(input: {
  project_id: string | null; exp_date: string; category: 'labour' | 'food' | 'transport' | 'tools' | 'other'
  description?: string; workers?: number | null; rate?: number | null; amount?: number
  payee?: string; method: Method; from_float?: boolean; photo_path?: string | null
}): Promise<ActionResult> {
  const me = await gate('pay'); if (typeof me === 'string') return fail(me)
  if (!METHODS.includes(input.method)) return fail('Pick how it was paid')
  const workers = input.workers ? Math.max(0, Math.floor(Number(input.workers))) : null
  const rate = input.rate ? money(input.rate) : null
  const amount = workers && rate ? money(workers * rate) : money(input.amount)
  if (amount <= 0) return fail('Enter the amount (or workers × daily rate)')
  const { error } = await db().from('ls_expenses').insert({
    project_id: input.project_id || null, exp_date: input.exp_date || todayIso(), category: input.category,
    description: input.description?.trim() || null, workers, rate, amount, payee: input.payee?.trim() || null,
    method: input.method, float_holder: input.method === 'cash' && input.from_float !== false ? me.user_id : null,
    photo_path: input.photo_path || null,
  })
  if (error) return fail(error.message)
  refresh('/landscaping/cash', '/landscaping/expenses', ...(input.project_id ? [`/landscaping/projects/${input.project_id}`] : []))
  return { success: true }
}

export async function removeExpense(id: string): Promise<ActionResult> {
  const me = await gate('admin'); if (typeof me === 'string') return fail(me)
  const { data: e } = await db().from('ls_expenses').select('*').eq('id', id).maybeSingle()
  if (!e) return fail('Expense not found')
  const { error } = await db().from('ls_expenses').delete().eq('id', id)
  if (error) return fail(error.message)
  await flagAlert({
    event_type: 'landscaping_money_changed', entity_type: 'ls_expense', entity_id: id,
    summary: `Landscaping ${e.category} expense removed: ${formatBDT(Number(e.amount))} (${e.exp_date})${e.description ? ` — ${e.description}` : ''}`,
    payload: { amount: Number(e.amount), category: e.category }, created_by: me.user_id,
  })
  refresh('/landscaping/cash', '/landscaping/expenses')
  return { success: true }
}

// ─── Projects, clients, variations, client payments ─────────────────────────

export async function saveClient(input: { id?: string; name: string; company?: string; phone?: string; email?: string; address?: string }): Promise<ActionData<{ id: string }>> {
  const me = await gate(); if (typeof me === 'string') return fail(me)
  if (!input.name?.trim()) return fail('Client name is required')
  const row = { name: input.name.trim(), company: input.company?.trim() || null, phone: input.phone?.trim() || null, email: input.email?.trim() || null, address: input.address?.trim() || null }
  const res = input.id
    ? await db().from('ls_clients').update(row).eq('id', input.id).select('id').single()
    : await db().from('ls_clients').insert(row).select('id').single()
  if (res.error) return fail(res.error.message)
  refresh('/landscaping/projects')
  return { success: true, data: { id: res.data.id } }
}

export async function saveProject(input: {
  id?: string; code: string; title: string; client_id?: string | null; new_client?: string
  site?: string; contract_value: number; start_date?: string | null; end_date?: string | null; status?: string; notes?: string
  /** Makes this a sub-project (e.g. ASU → Parking). One level only. */
  parent_id?: string | null
}): Promise<ActionData<{ id: string }>> {
  const me = await gate(); if (typeof me === 'string') return fail(me)
  if (!me.is_admin && !me.can_approve) return fail('Only the admin or an approver can set up projects')
  if (!input.code?.trim() || !input.title?.trim()) return fail('Project code and title are required')
  const parentId = input.parent_id || null
  if (parentId) {
    if (parentId === input.id) return fail('A project cannot be part of itself')
    const { data: parent } = await db().from('ls_projects').select('parent_id, client_id').eq('id', parentId).maybeSingle()
    if (!parent) return fail('Main project not found')
    if (parent.parent_id) return fail('A sub-project cannot have sub-projects of its own')
    if (input.id) {
      const { count } = await db().from('ls_projects').select('id', { count: 'exact', head: true }).eq('parent_id', input.id)
      if (count) return fail('This project has sub-projects, so it cannot become one')
    }
  }
  let clientId = input.client_id || null
  if (!clientId && input.new_client?.trim()) {
    const c = await saveClient({ name: input.new_client })
    if (!c.success) return fail(c.error)
    clientId = c.data.id
  }
  const row = {
    code: input.code.trim().toUpperCase(), title: input.title.trim(), client_id: clientId, site: input.site?.trim() || null,
    contract_value: money(input.contract_value), start_date: input.start_date || null, end_date: input.end_date || null,
    status: input.status || 'active', notes: input.notes?.trim() || null, updated_at: new Date().toISOString(),
    parent_id: parentId,
  }
  const res = input.id
    ? await db().from('ls_projects').update(row).eq('id', input.id).select('id').single()
    : await db().from('ls_projects').insert(row).select('id').single()
  if (res.error) return fail(/duplicate|unique/i.test(res.error.message) ? 'That project code is already used' : res.error.message)
  refresh('/landscaping/projects', `/landscaping/projects/${res.data.id}`, ...(parentId ? [`/landscaping/projects/${parentId}`] : []))
  return { success: true, data: { id: res.data.id } }
}

export async function addVariation(input: { project_id: string; var_date: string; description: string; amount: number }): Promise<ActionResult> {
  const me = await gate(); if (typeof me === 'string') return fail(me)
  if (!me.is_admin && !me.can_approve) return fail('Only the admin or an approver can change a contract')
  if (!input.description?.trim() || !Number(input.amount)) return fail('Describe the change and its amount (+ or −)')
  const { error } = await db().from('ls_variations').insert({ project_id: input.project_id, var_date: input.var_date || todayIso(), description: input.description.trim(), amount: money(input.amount) })
  if (error) return fail(error.message)
  refresh(`/landscaping/projects/${input.project_id}`, '/landscaping/projects')
  return { success: true }
}

export async function addClientReceipt(input: { project_id: string; receipt_date: string; amount: number; method: Method; reference?: string; note?: string }): Promise<ActionResult> {
  const me = await gate('pay'); if (typeof me === 'string') return fail(me)
  if (!METHODS.includes(input.method)) return fail('Pick how it was received')
  const amount = money(input.amount)
  if (amount <= 0) return fail('Enter the amount received')
  const { error } = await db().from('ls_client_receipts').insert({
    project_id: input.project_id, receipt_date: input.receipt_date || todayIso(), amount, method: input.method,
    reference: input.reference?.trim() || null, note: input.note?.trim() || null,
  })
  if (error) return fail(error.message)
  refresh(`/landscaping/projects/${input.project_id}`, '/landscaping/projects')
  return { success: true }
}

// ─── Team duties ────────────────────────────────────────────────────────────

export async function setDuties(userId: string, duties: { can_prepare: boolean; can_check: boolean; can_approve: boolean; can_pay: boolean }): Promise<ActionResult> {
  const me = await gate('admin'); if (typeof me === 'string') return fail(me)
  const { error } = await db().from('ls_members').upsert({ user_id: userId, ...duties }, { onConflict: 'user_id' })
  if (error) return fail(error.message)
  refresh('/landscaping/team')
  return { success: true }
}

/** Signed link to view a bill/receipt photo (bucket is private). */
export async function photoUrl(path: string): Promise<string | null> {
  await requirePermission('landscaping', 'read')
  const { data } = await createClient().storage.from('landscaping-bills').createSignedUrl(path, 600)
  return data?.signedUrl ?? null
}
