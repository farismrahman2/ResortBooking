'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission, getCurrentUserContext } from '@/lib/auth/permissions'
import { flagAlert } from '@/lib/auth/alerts'
import { getBookingById } from '@/lib/queries/bookings'
import { formatBDT } from '@/lib/formatters/currency'
import { updateBooking, cancelBooking } from './bookings'
import type { ActionResult, ActionData } from './types'

/**
 * CHANGE REQUESTS — Corporate Sales ask, the admin decides.
 *
 * Corporate Sales edit guest details, headcount, rooms and dates on their own
 * bookings directly; anything touching money goes through here
 * (migrations/security/008). Approving a discount applies it through the
 * normal updateBooking path, so totals recalculate; approving a cancel runs
 * cancelBooking; an advance or "other" request is marked approved for the
 * admin to record on the booking.
 */

export type ChangeKind = 'discount' | 'cancel' | 'advance' | 'other'

export interface ChangeRequestRow {
  id: string; booking_id: string; requested_by: string; kind: ChangeKind
  details: { discount?: number; discount_pct?: number; amount?: number; method?: string }
  note: string | null; status: 'pending' | 'approved' | 'rejected'
  decided_by: string | null; decided_at: string | null; decision_note: string | null; created_at: string
  booking?: { booking_number: string; customer_name: string; visit_date: string; total: number; discount: number } | null
  requester_name?: string | null
}

const KIND_LABEL: Record<ChangeKind, string> = {
  discount: 'Discount', cancel: 'Cancel booking', advance: 'Advance payment', other: 'Other change',
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createClient() as any

function describe(kind: ChangeKind, d: ChangeRequestRow['details']): string {
  if (kind === 'discount') {
    return [d.discount ? `${formatBDT(d.discount)} off` : null, d.discount_pct ? `${d.discount_pct}% off` : null].filter(Boolean).join(' + ') || 'discount'
  }
  if (kind === 'advance') return `${formatBDT(d.amount ?? 0)}${d.method ? ` via ${d.method}` : ''}`
  return KIND_LABEL[kind]
}

/** File a request on a booking you made (the database checks it is yours). */
export async function createChangeRequest(input: {
  bookingId: string; kind: ChangeKind; note?: string
  discount?: number; discount_pct?: number; amount?: number; method?: string
}): Promise<ActionResult> {
  await requirePermission('bookings', 'write')
  const ctx = await getCurrentUserContext()
  if (!ctx) return { success: false, error: 'Not signed in' }
  if (!['discount', 'cancel', 'advance', 'other'].includes(input.kind)) return { success: false, error: 'Pick what to change' }

  const details: ChangeRequestRow['details'] = {}
  if (input.kind === 'discount') {
    const flat = Math.max(0, Math.round(Number(input.discount ?? 0)))
    const pct  = Math.max(0, Math.min(100, Number(input.discount_pct ?? 0)))
    if (!flat && !pct) return { success: false, error: 'Enter the discount — an amount or a percentage' }
    details.discount = flat; details.discount_pct = pct
  }
  if (input.kind === 'advance') {
    const amount = Math.round(Number(input.amount ?? 0))
    if (amount <= 0) return { success: false, error: 'Enter the advance amount' }
    details.amount = amount; details.method = input.method || undefined
  }
  const note = (input.note ?? '').trim() || null
  if ((input.kind === 'other' || input.kind === 'cancel') && !note) return { success: false, error: 'Add a short note saying why' }

  const { error } = await db().from('booking_change_requests').insert({
    booking_id: input.bookingId, requested_by: ctx.user_id, kind: input.kind, details, note,
  })
  if (error) return { success: false, error: /row-level security/i.test(error.message) ? 'You can only ask for changes on bookings you made.' : error.message }

  const { data: b } = await db().from('bookings').select('booking_number, customer_name').eq('id', input.bookingId).maybeSingle()
  await flagAlert({
    event_type:  'change_requested',
    entity_type: 'booking',
    entity_id:   input.bookingId,
    summary:     `Change requested by ${ctx.profile.full_name}: ${KIND_LABEL[input.kind]} — ${describe(input.kind, details)} on ${b?.customer_name ?? ''} (${b?.booking_number ?? input.bookingId})`,
    payload:     { kind: input.kind, details, note },
    created_by:  ctx.user_id,
  })
  revalidatePath(`/bookings/${input.bookingId}`)
  revalidatePath('/settings/change-requests')
  return { success: true }
}

/** Requests on one booking (the requester sees their own; the admin all). */
export async function listBookingChangeRequests(bookingId: string): Promise<ChangeRequestRow[]> {
  const { data } = await db().from('booking_change_requests').select('*').eq('booking_id', bookingId).order('created_at', { ascending: false })
  return (data ?? []) as ChangeRequestRow[]
}

/** Admin: every request, pending first. */
export async function listChangeRequests(): Promise<ChangeRequestRow[]> {
  await requirePermission('settings', 'write')
  const { data } = await db().from('booking_change_requests')
    .select('*, booking:bookings (booking_number, customer_name, visit_date, total, discount)')
    .order('created_at', { ascending: false }).limit(200)
  const rows = (data ?? []) as ChangeRequestRow[]
  const ids = [...new Set(rows.map((r) => r.requested_by))]
  if (ids.length) {
    const { data: people } = await db().from('user_profiles').select('user_id, full_name').in('user_id', ids)
    const name = new Map(((people ?? []) as Array<{ user_id: string; full_name: string }>).map((p) => [p.user_id, p.full_name]))
    for (const r of rows) r.requester_name = name.get(r.requested_by) ?? null
  }
  return rows.sort((a, b) => Number(b.status === 'pending') - Number(a.status === 'pending'))
}

export async function pendingChangeRequestCount(): Promise<number> {
  const { count } = await db().from('booking_change_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending')
  return count ?? 0
}

/** Admin: approve (and apply where it can be applied) or reject a request. */
export async function decideChangeRequest(id: string, approve: boolean, decisionNote?: string): Promise<ActionData<{ applied: boolean }>> {
  await requirePermission('settings', 'write')
  const ctx = await getCurrentUserContext()
  if (!ctx || ctx.profile.role.slug !== 'admin') return { success: false, error: 'Only the admin decides change requests.' }

  const { data: req } = await db().from('booking_change_requests').select('*').eq('id', id).maybeSingle()
  if (!req) return { success: false, error: 'Request not found' }
  if (req.status !== 'pending') return { success: false, error: `Already ${req.status}` }
  const r = req as ChangeRequestRow

  let applied = false
  if (approve && r.kind === 'cancel') {
    const res = await cancelBooking(r.booking_id)
    if (!res.success) return { success: false, error: `Could not cancel: ${res.error}` }
    applied = true
  }
  if (approve && r.kind === 'discount') {
    const b = await getBookingById(r.booking_id)
    if (!b) return { success: false, error: 'Booking not found' }
    if (b.package_type !== 'group') {
      // The booking as stored, with only the discount changed — totals recalculate.
      const res = await updateBooking(b.id, {
        customer_name: b.customer_name, customer_phone: b.customer_phone, customer_notes: b.customer_notes ?? null,
        discount: Number(r.details.discount ?? 0), discount_pct: Number(r.details.discount_pct ?? 0),
        service_charge_pct: Number(b.service_charge_pct ?? 0), vat_pct: Number(b.vat_pct ?? 0),
        advance_paid: Number(b.advance_paid), advance_required: Number(b.advance_required),
        adults: b.adults, children_paid: b.children_paid, children_free: b.children_free, drivers: b.drivers, extra_beds: b.extra_beds ?? 0,
        rooms: b.rooms.map((x) => ({
          room_type: x.room_type, display_name: x.room_type.replace(/_/g, ' '), qty: x.qty, unit_price: Number(x.unit_price),
          room_numbers: x.room_numbers ?? [], evening_rooms: x.evening_rooms ?? [],
        })),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        extra_items: ((b as any).extra_items ?? []) as Array<{ label: string; qty: number; unit_price: number }>,
        package_type: b.package_type, visit_date: b.visit_date, check_out_date: b.check_out_date,
        package_snapshot: b.package_snapshot,
      })
      if (!res.success) return { success: false, error: `Could not apply the discount: ${res.error}` }
      applied = true
    }
  }

  const { error } = await db().from('booking_change_requests').update({
    status: approve ? 'approved' : 'rejected', decided_by: ctx.user_id, decided_at: new Date().toISOString(),
    decision_note: (decisionNote ?? '').trim() || null,
  }).eq('id', id)
  if (error) return { success: false, error: error.message }

  const { data: b } = await db().from('bookings').select('booking_number, customer_name').eq('id', r.booking_id).maybeSingle()
  await flagAlert({
    event_type:  'change_request_decided',
    entity_type: 'booking',
    entity_id:   r.booking_id,
    summary:     `Change request ${approve ? 'approved' : 'rejected'}: ${KIND_LABEL[r.kind]} — ${describe(r.kind, r.details)} on ${b?.customer_name ?? ''} (${b?.booking_number ?? r.booking_id})${approve && !applied ? ' · to record on the booking' : ''}`,
    payload:     { request_id: id, kind: r.kind, approve, applied },
    created_by:  ctx.user_id,
  })
  revalidatePath('/settings/change-requests')
  revalidatePath(`/bookings/${r.booking_id}`)
  return { success: true, data: { applied } }
}
