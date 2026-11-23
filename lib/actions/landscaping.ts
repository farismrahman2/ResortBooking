'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/permissions'
import { flagAlert } from '@/lib/auth/alerts'
import { getLsMe, getRequisition, nextRequisitionNo, type LsMe } from '@/lib/queries/landscaping'
import { canActOnRequisition, canSelfApprove, deleteRule, editRule, formatReqNo, lineAmount, requisitionSpend, requisitionTotal } from '@/lib/landscaping/money'
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
  /** From the pick lists — the names are filled in from them. */
  category_id?: string | null
  requested_by_person?: string | null
  /** Names printed on the slip's signature lines (picked from the people list). */
  slip_prepared_by?: string | null
  slip_checked_by?: string | null
  slip_approved_by?: string | null
  /** Photo/PDF of the requisition slip (optional; undefined = leave as it is). */
  slip_photo_path?: string | null
  /** Several photos/PDFs of the slip; replaces slip_photo_path + extras when given. */
  slip_photo_paths?: string[]
  /** Approver (or admin) approving their own requisition in one step, naming who approved it. */
  self_approve?: { approved_by_name?: string | null }
  items: Array<{ description: string; qty: number; unit?: string | null; unit_price: number }>
  submit?: boolean
}

/** Category and requester picked from the lists → their ids plus the names printed on the slip. */
async function picks(input: { category_id?: string | null; requested_by_person?: string | null; department?: string | null; requested_by_name?: string | null }) {
  const [{ data: cat }, { data: person }] = await Promise.all([
    input.category_id ? db().from('ls_work_categories').select('id, name').eq('id', input.category_id).maybeSingle() : Promise.resolve({ data: null }),
    input.requested_by_person ? db().from('ls_people').select('id, name').eq('id', input.requested_by_person).maybeSingle() : Promise.resolve({ data: null }),
  ])
  return {
    category_id: cat?.id ?? null,
    department: cat?.name ?? (input.department?.trim() || null),
    requested_by_person: person?.id ?? null,
    requested_by_name: person?.name ?? (input.requested_by_name?.trim() || null),
  }
}

/** Create or edit a requisition (draft or sent back), optionally submitting it for checking. */
export async function saveRequisition(input: RequisitionInput): Promise<ActionData<{ id: string }>> {
  const me = await gate('prepare'); if (typeof me === 'string') return fail(me)
  const items = (input.items ?? []).filter((i) => i.description.trim() && Number(i.qty) > 0)
  if (!input.description?.trim()) return fail('Add a description')
  if (items.length === 0) return fail('Add at least one item')
  if (items.some((i) => Number(i.unit_price) < 0)) return fail('Prices cannot be negative')
  const total = requisitionTotal(items)
  if (input.self_approve) {
    const ok = canSelfApprove('draft', me)
    if (!ok.ok) return fail(ok.reason)
  }

  const header = {
    project_id: input.project_id || null, req_date: input.req_date || todayIso(),
    ...(await picks(input)), description: input.description.trim(),
    area_note: input.area_note?.trim() || null, remarks: input.remarks?.trim() || null, total,
    paper_prepared_by: input.slip_prepared_by?.trim() || null,
    paper_checked_by: input.slip_checked_by?.trim() || null,
    paper_approved_by: input.slip_approved_by?.trim() || null,
    ...(input.slip_photo_paths !== undefined
      ? { slip_photo_path: input.slip_photo_paths[0] ?? null, extra_photo_paths: input.slip_photo_paths.slice(1) }
      : input.slip_photo_path !== undefined ? { slip_photo_path: input.slip_photo_path || null } : {}),
    ...(input.submit ? { status: 'submitted', submitted_at: new Date().toISOString() } : {}),
  }

  let id = input.id
  if (id) {
    const { data: cur } = await db().from('ls_requisitions').select('status, prepared_by, req_no, total').eq('id', id).maybeSingle()
    if (!cur) return fail('Requisition not found')
    const edit = editRule(cur.status, cur.prepared_by === me.user_id, me.is_admin)
    if (!edit.ok) return fail(edit.why)
    // Fixing a sent one keeps it in the queue for checking, with any check cleared.
    // The admin correcting an approved one leaves it approved.
    const stillSent = edit.alreadySent
    const keep = 'keepApproved' in edit && edit.keepApproved
    const { error } = await db().from('ls_requisitions').update(keep
      ? { ...header, status: 'approved', updated_at: new Date().toISOString() }
      : {
          ...header, ...(stillSent ? { status: 'submitted' } : input.submit ? {} : { status: 'draft' }),
          checked_by: null, checked_at: null, rejected_by: null, rejected_at: null, reject_note: null, updated_at: new Date().toISOString(),
        }).eq('id', id)
    if (error) return fail(error.message)
    if (stillSent) {
      await flagAlert({
        event_type: 'landscaping_money_changed', entity_type: 'ls_requisition', entity_id: id,
        summary: `Landscaping Req ${formatReqNo(cur.req_no)} edited after sending (${cur.status}) — total ${formatBDT(Number(cur.total))} → ${formatBDT(total)}`,
        payload: { from: Number(cur.total), to: total, status: cur.status }, created_by: me.user_id,
      })
    }
    const { error: delErr } = await db().from('ls_requisition_items').delete().eq('requisition_id', id)
    if (delErr) return fail(delErr.message)
  } else {
    const reqNo = Number(input.req_no) > 0 ? Math.floor(Number(input.req_no)) : await nextRequisitionNo()
    await freeCancelledNumber(reqNo, me.user_id)
    const { data, error } = await db().from('ls_requisitions').insert({ ...header, req_no: reqNo, prepared_by: me.user_id }).select('id').single()
    if (error) {
      if (!/duplicate|unique/i.test(error.message)) return fail(error.message)
      const { data: taken } = await db().from('ls_requisitions').select('status').eq('req_no', reqNo).maybeSingle()
      const next = await nextRequisitionNo()
      return fail(`Requisition no. ${formatReqNo(reqNo)} is already used${taken?.status ? ` (${taken.status})` : ''}. Next free number: ${formatReqNo(next)}`)
    }
    id = data.id as string
  }
  const { error: itemErr } = await db().from('ls_requisition_items').insert(items.map((i, k) => ({
    requisition_id: id, line_no: k + 1, description: i.description.trim(), qty: Number(i.qty),
    unit: i.unit?.trim() || null, unit_price: Number(i.unit_price), amount: lineAmount(i),
  })))
  if (itemErr) return fail(itemErr.message)
  if (input.self_approve) {
    const r = await selfApproveRequisition(id!, input.self_approve.approved_by_name ?? null)
    if (!r.success) return fail(`Saved, but not approved: ${r.error}`)
  }
  refresh('/landscaping/requisitions', `/landscaping/requisitions/${id}`)
  return { success: true, data: { id: id! } }
}

/**
 * An approver (or the admin) approves a requisition in one step — usually one
 * they prepared themselves. It is marked self-approved, the approver's name is
 * printed on the slip, and the admin's Audit Log records it.
 */
export async function selfApproveRequisition(id: string, approvedByName: string | null): Promise<ActionResult> {
  const me = await gate(); if (typeof me === 'string') return fail(me)
  const { data: req } = await db().from('ls_requisitions').select('status, req_no, total, description, prepared_by').eq('id', id).maybeSingle()
  if (!req) return fail('Requisition not found')
  const ok = canSelfApprove(req.status, me)
  if (!ok.ok) return fail(ok.reason)
  const now = new Date().toISOString()
  const name = approvedByName?.trim() || me.name
  const { error } = await db().from('ls_requisitions').update({
    status: 'approved', self_approved: true,
    submitted_at: now, checked_by: me.user_id, checked_at: now, approved_by: me.user_id, approved_at: now,
    paper_approved_by: name, rejected_by: null, rejected_at: null, reject_note: null, updated_at: now,
  }).eq('id', id).eq('status', req.status)
  if (error) return fail(error.message)
  await flagAlert({
    event_type: 'landscaping_money_changed', entity_type: 'ls_requisition', entity_id: id,
    summary: `Landscaping Req ${formatReqNo(req.req_no)} self-approved by ${me.name}${name !== me.name ? ` (approved by ${name})` : ''} — ${formatBDT(Number(req.total))}, ${req.description}`,
    payload: { approved_by_name: name, total: Number(req.total) }, created_by: me.user_id,
  })
  refresh('/landscaping/requisitions', `/landscaping/requisitions/${id}`, '/landscaping')
  return { success: true }
}

/** Delete a requisition with no bills. Preparer until approved; the admin any time. Logged. */
export async function deleteRequisition(id: string): Promise<ActionResult> {
  const me = await gate(); if (typeof me === 'string') return fail(me)
  const { data: req } = await db().from('ls_requisitions').select('id, req_no, status, total, description, prepared_by, ls_bills(id)').eq('id', id).maybeSingle()
  if (!req) return fail('Requisition not found')
  const ok = deleteRule(req.status, (req.ls_bills ?? []).length > 0, req.prepared_by === me.user_id, me.is_admin)
  if (!ok.ok) return fail(ok.why)
  const r = await removeRequisition(id, me.user_id, 'deleted')
  if (!r.success) return r
  refresh('/landscaping/requisitions', '/landscaping')
  return { success: true }
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

/**
 * Cancel = remove. A cancelled requisition is deleted (with its items) so its
 * number is free again — e.g. to enter the real paper slip with that number.
 * The Audit Log keeps a note of what was removed. Not allowed once it has bills.
 */
export async function cancelRequisition(id: string): Promise<ActionResult> {
  const me = await gate(); if (typeof me === 'string') return fail(me)
  const { data: req } = await db().from('ls_requisitions').select('status, prepared_by, ls_bills(id)').eq('id', id).maybeSingle()
  if (!req) return fail('Requisition not found')
  if ((req.ls_bills ?? []).length) return fail('This requisition already has bills — it cannot be cancelled')
  if (req.prepared_by !== me.user_id && !me.is_admin) return fail('Only the person who prepared it, or the admin, can cancel it')
  if (req.status === 'approved' && !me.is_admin) return fail('It is approved — ask the admin to cancel it')
  const r = await removeRequisition(id, me.user_id, 'cancelled')
  if (!r.success) return r
  refresh('/landscaping/requisitions', '/landscaping')
  return { success: true }
}

/** Delete a requisition and its items, leaving a note in the Audit Log. */
async function removeRequisition(id: string, by: string, how: 'cancelled' | 'deleted'): Promise<ActionResult> {
  const { data: req } = await db().from('ls_requisitions').select('req_no, status, total, description').eq('id', id).maybeSingle()
  if (!req) return fail('Requisition not found')
  const { error: itemErr } = await db().from('ls_requisition_items').delete().eq('requisition_id', id)
  if (itemErr) return fail(itemErr.message)
  const { error } = await db().from('ls_requisitions').delete().eq('id', id)
  if (error) return fail(error.message)
  await flagAlert({
    event_type: 'landscaping_money_changed', entity_type: 'ls_requisition', entity_id: id,
    summary: `Landscaping Req ${formatReqNo(req.req_no)} ${how} and removed (was ${req.status}) — ${formatBDT(Number(req.total))}, ${req.description}. Its number is free again.`,
    payload: { req_no: req.req_no, status: req.status, total: Number(req.total) }, created_by: by,
  })
  return { success: true }
}

/** If an old cancelled requisition (no bills) still holds this number, remove it so the number can be used. */
async function freeCancelledNumber(reqNo: number, by: string) {
  const { data } = await db().from('ls_requisitions').select('id, status, ls_bills(id)').eq('req_no', reqNo).maybeSingle()
  if (data && data.status === 'cancelled' && !(data.ls_bills ?? []).length) await removeRequisition(data.id, by, 'cancelled')
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
  photo_paths?: string[]
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
    bill_date: input.bill_date || todayIso(), amount, note: input.note?.trim() || null,
    photo_path: input.photo_paths ? input.photo_paths[0] ?? null : input.photo_path || null,
    extra_photo_paths: input.photo_paths ? input.photo_paths.slice(1) : [],
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
export async function payBill(input: {
  bill_id: string; amount: number; pay_date: string; method: Method; reference?: string; from_float?: boolean
  /** Photo/PDF of the payment slip (receipt / challan) and remarks. */
  photo_path?: string | null; note?: string
  photo_paths?: string[]
}): Promise<ActionResult> {
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
    photo_path: input.photo_paths ? input.photo_paths[0] ?? null : input.photo_path || null,
    extra_photo_paths: input.photo_paths ? input.photo_paths.slice(1) : [],
    note: input.note?.trim() || null,
  })
  if (error) return fail(error.message)
  refresh('/landscaping/bills', `/landscaping/requisitions/${bill.requisition_id}`, '/landscaping/suppliers', `/landscaping/suppliers/${bill.supplier_id}`, '/landscaping/cash')
  return { success: true }
}

// ─── Payment records: approved requisition + payment slip ───────────────────

export interface RequisitionPaymentInput {
  requisition_id: string
  /** Photo/PDF of the signed, approved requisition slip (kept on the requisition). */
  requisition_slip_path?: string | null
  /** Photo/PDF of the payment slip (receipt / challan). */
  payment_slip_path?: string | null
  /** Several payment slip photos/PDFs. */
  payment_slip_paths?: string[]
  /** Several approved-slip photos/PDFs (replace what is attached). */
  requisition_slip_paths?: string[]
  amount: number
  pay_date: string
  method: Method
  from_float?: boolean
  reference?: string
  note?: string
  /** Pay this bill; or, with no bill, record the supplier's bill for this payment. */
  bill_id?: string | null
  supplier_id?: string | null
  new_supplier?: string | null
  bill_no?: string | null
}

/**
 * One step from the Payment records page: link a payment and its slip to an
 * approved requisition (and keep the approved slip photo on it). Pays an
 * existing bill, or — when the supplier's bill isn't in yet — records the bill
 * for the amount paid, so the books stay complete.
 */
export async function recordRequisitionPayment(input: RequisitionPaymentInput): Promise<ActionData<{ requisition_id: string }>> {
  const me = await gate('pay'); if (typeof me === 'string') return fail(me)
  const paySlips = input.payment_slip_paths ?? (input.payment_slip_path ? [input.payment_slip_path] : [])
  if (!paySlips.length) return fail('Attach the payment slip photo')
  const amount = money(input.amount)
  if (amount <= 0) return fail('Enter the amount paid')
  const { data: req } = await db().from('ls_requisitions').select('id, req_no, status, slip_photo_path').eq('id', input.requisition_id).maybeSingle()
  if (!req) return fail('Requisition not found')
  if (req.status !== 'approved') return fail('Only an approved requisition can take payments')

  let billId = input.bill_id || null
  if (!billId) {
    const b = await addBill({
      requisition_id: req.id, supplier_id: input.supplier_id || undefined, new_supplier: input.new_supplier || undefined,
      bill_no: input.bill_no || undefined, bill_date: input.pay_date, amount, note: 'Recorded with its payment slip',
      photo_path: null,
    })
    if (!b.success) return fail(b.error)
    billId = b.data.id
  }
  const paid = await payBill({
    bill_id: billId, amount, pay_date: input.pay_date, method: input.method, from_float: input.from_float,
    reference: input.reference, photo_paths: paySlips, note: input.note,
  })
  if (!paid.success) {
    // A bill made only for this payment goes again if the payment failed.
    if (!input.bill_id) await db().from('ls_bills').delete().eq('id', billId)
    return fail(paid.error)
  }
  if (input.requisition_slip_paths?.length) {
    await db().from('ls_requisitions').update({ slip_photo_path: input.requisition_slip_paths[0], extra_photo_paths: input.requisition_slip_paths.slice(1), updated_at: new Date().toISOString() }).eq('id', req.id)
  } else if (input.requisition_slip_path && input.requisition_slip_path !== req.slip_photo_path) {
    await db().from('ls_requisitions').update({ slip_photo_path: input.requisition_slip_path, updated_at: new Date().toISOString() }).eq('id', req.id)
  }
  refresh('/landscaping/payments', `/landscaping/requisitions/${req.id}`)
  return { success: true, data: { requisition_id: req.id } }
}

/** Attach or replace the approved requisition slip photo. Replacing one is logged. */
export async function setRequisitionSlip(requisitionId: string, pathOrPaths: string | string[] | null): Promise<ActionResult> {
  const paths = Array.isArray(pathOrPaths) ? pathOrPaths : pathOrPaths ? [pathOrPaths] : []
  const path = paths[0] ?? null
  const me = await gate(); if (typeof me === 'string') return fail(me)
  if (!(me.can_prepare || me.can_approve || me.can_pay || me.is_admin)) return fail('You cannot change this requisition')
  const { data: req } = await db().from('ls_requisitions').select('id, req_no, slip_photo_path').eq('id', requisitionId).maybeSingle()
  if (!req) return fail('Requisition not found')
  if (req.slip_photo_path && !me.is_admin) return fail('A slip photo is already attached — ask the admin to replace it')
  const { error } = await db().from('ls_requisitions').update({ slip_photo_path: path, extra_photo_paths: paths.slice(1), updated_at: new Date().toISOString() }).eq('id', requisitionId)
  if (error) return fail(error.message)
  if (req.slip_photo_path) {
    await flagAlert({
      event_type: 'landscaping_money_changed', entity_type: 'ls_requisition', entity_id: requisitionId,
      summary: `Landscaping Req ${formatReqNo(req.req_no)}: approved slip photo ${path ? 'replaced' : 'removed'}`,
      payload: { old: req.slip_photo_path, new: path }, created_by: me.user_id,
    })
  }
  refresh('/landscaping/payments', `/landscaping/requisitions/${requisitionId}`)
  return { success: true }
}

/**
 * Edit a payment record. Slip photo and remarks: the person who entered it,
 * or the admin. Amount, date and method: the admin only (logged).
 */
export async function updatePaymentRecord(paymentId: string, input: {
  photo_path?: string | null; note?: string; reference?: string
  amount?: number; pay_date?: string; method?: Method
  photo_paths?: string[]
}): Promise<ActionResult> {
  if (input.photo_paths !== undefined) input = { ...input, photo_path: input.photo_paths[0] ?? null }
  const me = await gate(); if (typeof me === 'string') return fail(me)
  const { data: p } = await db().from('ls_bill_payments').select('*, bill:ls_bills(id, amount, bill_no, requisition_id, ls_bill_payments(id, amount))').eq('id', paymentId).maybeSingle()
  if (!p) return fail('Payment not found')
  const own = p.created_by === me.user_id
  if (!own && !me.is_admin) return fail('Only the person who entered this payment, or the admin, can change it')
  const moneyChange = (input.amount !== undefined && money(input.amount) !== Number(p.amount))
    || (input.pay_date !== undefined && input.pay_date !== p.pay_date)
    || (input.method !== undefined && input.method !== p.method)
  if (moneyChange && !me.is_admin) return fail('Only the admin can change the amount, date or method')
  const patch: Record<string, unknown> = { updated_by: me.user_id, updated_at: new Date().toISOString() }
  if (input.photo_path !== undefined) patch.photo_path = input.photo_path || null
  if (input.photo_paths !== undefined) patch.extra_photo_paths = input.photo_paths.slice(1)
  if (input.note !== undefined) patch.note = input.note.trim() || null
  if (input.reference !== undefined) patch.reference = input.reference.trim() || null
  if (moneyChange) {
    const amount = money(input.amount ?? p.amount)
    if (amount <= 0) return fail('Amount must be above 0')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const others = ((p.bill?.ls_bill_payments ?? []) as any[]).filter((x) => x.id !== paymentId).reduce((s, x) => s + Number(x.amount), 0)
    if (amount > money(Number(p.bill?.amount ?? 0) - others) + 0.005) return fail('That is more than the bill — fix the bill amount first')
    if (input.method && !METHODS.includes(input.method)) return fail('Pick how it was paid')
    Object.assign(patch, { amount, pay_date: input.pay_date ?? p.pay_date, method: input.method ?? p.method })
  }
  const { error } = await db().from('ls_bill_payments').update(patch).eq('id', paymentId)
  if (error) return fail(error.message)
  if (moneyChange || (p.photo_path && input.photo_path !== undefined && input.photo_path !== p.photo_path)) {
    await flagAlert({
      event_type: 'landscaping_money_changed', entity_type: 'ls_bill_payment', entity_id: paymentId,
      summary: `Landscaping payment changed (bill ${p.bill?.bill_no ?? '—'}): ${[
        moneyChange ? `${formatBDT(Number(p.amount))} ${p.pay_date} ${p.method} → ${formatBDT(Number(patch.amount))} ${patch.pay_date} ${patch.method}` : null,
        p.photo_path && input.photo_path !== p.photo_path ? 'payment slip replaced' : null,
      ].filter(Boolean).join('; ')}`,
      payload: { before: { amount: Number(p.amount), pay_date: p.pay_date, method: p.method, photo_path: p.photo_path }, after: patch }, created_by: me.user_id,
    })
  }
  refresh('/landscaping/payments', '/landscaping/bills', `/landscaping/requisitions/${p.bill?.requisition_id}`, '/landscaping/cash')
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
  project_id: string | null; exp_date: string; category: 'labour' | 'food' | 'transport' | 'tools' | 'other' | 'before_system'
  description?: string; workers?: number | null; rate?: number | null; amount?: number
  payee?: string; method: Method; from_float?: boolean; photo_path?: string | null
  work_category_id?: string | null
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
    photo_path: input.photo_path || null, work_category_id: input.work_category_id || null,
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

// ─── Pick lists (admin) ─────────────────────────────────────────────────────

/** Add or edit someone on the people list (requested by, signed on paper, sardars). */
export async function savePerson(input: { id?: string; name: string; designation?: string; phone?: string; is_active?: boolean }): Promise<ActionData<{ id: string }>> {
  const me = await gate('admin'); if (typeof me === 'string') return fail(me)
  const name = input.name?.trim().replace(/\s+/g, ' ')
  if (!name) return fail('Enter the name')
  const row = { name, designation: input.designation?.trim() || null, phone: input.phone?.trim() || null, is_active: input.is_active ?? true }
  const res = input.id
    ? await db().from('ls_people').update(row).eq('id', input.id).select('id').single()
    : await db().from('ls_people').insert(row).select('id').single()
  if (res.error) return fail(/duplicate|unique/i.test(res.error.message) ? `${name} is already on the list` : res.error.message)
  refresh('/landscaping/team', '/landscaping/requisitions/new', '/landscaping/requisitions/past')
  return { success: true, data: { id: res.data.id } }
}

/** Add, rename, reorder or hide a work category. Hidden ones stay on old records. */
export async function saveWorkCategory(input: { id?: string; name: string; sort_order?: number; is_active?: boolean }): Promise<ActionData<{ id: string }>> {
  const me = await gate('admin'); if (typeof me === 'string') return fail(me)
  const name = input.name?.trim().replace(/\s+/g, ' ')
  if (!name) return fail('Enter the category name')
  const row = { name, sort_order: Math.floor(Number(input.sort_order ?? 100)) || 100, is_active: input.is_active ?? true }
  const res = input.id
    ? await db().from('ls_work_categories').update(row).eq('id', input.id).select('id').single()
    : await db().from('ls_work_categories').insert(row).select('id').single()
  if (res.error) return fail(/duplicate|unique/i.test(res.error.message) ? `${name} already exists` : res.error.message)
  refresh('/landscaping/team', '/landscaping/reports')
  return { success: true, data: { id: res.data.id } }
}

// ─── Bringing past paper records into the system (admin) ────────────────────

export interface PastRequisitionInput {
  req_no: number
  project_id: string | null
  req_date: string
  department?: string | null
  description: string
  area_note?: string | null
  remarks?: string | null
  requested_by_name?: string | null
  category_id?: string | null
  requested_by_person?: string | null
  paper_prepared_by?: string | null
  paper_checked_by?: string | null
  paper_approved_by?: string | null
  slip_photo_path?: string | null
  slip_photo_paths?: string[]
  items: Array<{ description: string; qty: number; unit?: string | null; unit_price: number }>
  bills: Array<{
    supplier_id?: string; new_supplier?: string; bill_no?: string; bill_date: string; amount: number
    note?: string; photo_path?: string | null; photo_paths?: string[]
    paid_amount?: number; paid_date?: string; paid_method?: Method; paid_reference?: string
  }>
}

/**
 * A requisition already signed on paper, with its bills and payments, entered
 * in one go — saved as approved and marked "from paper". Past cash payments
 * are not taken from anyone's current cash in hand. All or nothing: if any
 * step fails, what was saved is removed again.
 */
export async function recordPastRequisition(input: PastRequisitionInput): Promise<ActionData<{ id: string }>> {
  const me = await gate('admin'); if (typeof me === 'string') return fail(me)
  const reqNo = Math.floor(Number(input.req_no))
  if (!(reqNo > 0)) return fail('Enter the Req. No. from the paper slip')
  if (!input.description?.trim()) return fail('Add the description')
  const items = (input.items ?? []).filter((i) => i.description.trim() && Number(i.qty) > 0)
  if (items.length === 0) return fail('Add at least one item')
  const total = requisitionTotal(items)
  const bills = (input.bills ?? []).filter((b) => Number(b.amount) > 0)
  for (const [k, b] of bills.entries()) {
    if (!b.supplier_id && !b.new_supplier?.trim()) return fail(`Bill ${k + 1}: pick or add the supplier`)
    const paid = money(b.paid_amount)
    if (paid > money(b.amount) + 0.005) return fail(`Bill ${k + 1}: paid is more than the bill`)
    if (paid > 0 && !METHODS.includes(b.paid_method as Method)) return fail(`Bill ${k + 1}: how was it paid?`)
  }
  await freeCancelledNumber(reqNo, me.user_id)
  const { data: taken } = await db().from('ls_requisitions').select('id').eq('req_no', reqNo).maybeSingle()
  if (taken) return fail(`Requisition no. ${formatReqNo(reqNo)} is already in the system`)

  const reqDate = input.req_date || todayIso()
  const stamp = new Date(`${reqDate}T06:00:00Z`).toISOString()   // noon in Dhaka on the slip date
  const { data: req, error } = await db().from('ls_requisitions').insert({
    req_no: reqNo, project_id: input.project_id || null, req_date: reqDate,
    ...(await picks(input)), description: input.description.trim(),
    area_note: input.area_note?.trim() || null, remarks: input.remarks?.trim() || null, total,
    status: 'approved', from_paper: true, prepared_by: me.user_id,
    submitted_at: stamp, checked_at: stamp, approved_at: stamp,
    paper_prepared_by: input.paper_prepared_by?.trim() || null,
    paper_checked_by: input.paper_checked_by?.trim() || null,
    paper_approved_by: input.paper_approved_by?.trim() || null,
    slip_photo_path: input.slip_photo_paths ? input.slip_photo_paths[0] ?? null : input.slip_photo_path || null,
    extra_photo_paths: input.slip_photo_paths ? input.slip_photo_paths.slice(1) : [],
  }).select('id').single()
  if (error) return fail(/duplicate|unique/i.test(error.message) ? `Requisition no. ${formatReqNo(reqNo)} is already in the system` : error.message)

  const billIds: string[] = []
  const undo = async (why: string) => {
    if (billIds.length) {
      await db().from('ls_bill_payments').delete().in('bill_id', billIds)
      await db().from('ls_bills').delete().in('id', billIds)
    }
    await db().from('ls_requisitions').delete().eq('id', req.id)   // items go with it
    return fail(`Nothing was saved — ${why}`)
  }

  const { error: itemErr } = await db().from('ls_requisition_items').insert(items.map((i, k) => ({
    requisition_id: req.id, line_no: k + 1, description: i.description.trim(), qty: Number(i.qty),
    unit: i.unit?.trim() || null, unit_price: Number(i.unit_price), amount: lineAmount(i),
  })))
  if (itemErr) return undo(itemErr.message)

  let billed = 0, paidTotal = 0
  for (const b of bills) {
    let supplierId = b.supplier_id
    if (!supplierId) {
      const { data: existing } = await db().from('ls_suppliers').select('id').ilike('name', b.new_supplier!.trim()).maybeSingle()
      if (existing) supplierId = existing.id
      else {
        const sres = await saveSupplier({ name: b.new_supplier! })
        if (!sres.success) return undo(sres.error)
        supplierId = sres.data.id
      }
    }
    const { data: bill, error: billErr } = await db().from('ls_bills').insert({
      requisition_id: req.id, supplier_id: supplierId, bill_no: b.bill_no?.trim() || null,
      bill_date: b.bill_date || reqDate, amount: money(b.amount), note: b.note?.trim() || null,
      photo_path: b.photo_paths ? b.photo_paths[0] ?? null : b.photo_path || null, extra_photo_paths: b.photo_paths ? b.photo_paths.slice(1) : [],
    }).select('id').single()
    if (billErr) return undo(billErr.message)
    billIds.push(bill.id)
    billed += money(b.amount)
    const paid = money(b.paid_amount)
    if (paid > 0) {
      const { error: payErr } = await db().from('ls_bill_payments').insert({
        bill_id: bill.id, amount: paid, pay_date: b.paid_date || b.bill_date || reqDate, method: b.paid_method,
        reference: b.paid_reference?.trim() || null, float_holder: null,   // paid before the system
      })
      if (payErr) return undo(payErr.message)
      paidTotal += paid
    }
  }

  await flagAlert({
    event_type: 'landscaping_past_entry', entity_type: 'ls_requisition', entity_id: req.id,
    summary: `Landscaping Req ${formatReqNo(reqNo)} entered from paper — ${formatBDT(total)}, ${bills.length} bill${bills.length === 1 ? '' : 's'} (${formatBDT(billed)}), ${formatBDT(paidTotal)} paid`,
    payload: { req_no: reqNo, total, bills: bills.length, billed, paid: paidTotal }, created_by: me.user_id,
  })
  refresh('/landscaping/requisitions', `/landscaping/requisitions/${req.id}`, '/landscaping/bills', '/landscaping/suppliers', '/landscaping/projects')
  return { success: true, data: { id: req.id } }
}
