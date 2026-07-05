'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { checkPermission, getCurrentUserContext } from '@/lib/auth/permissions'
import {
  enquiryNoteSchema, enquiryStatusSchema,
  type EnquiryNoteInput, type EnquiryStatusInput,
} from '@/lib/validators/enquiries'
import type { ActionResult } from './types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const dbc = () => createClient() as any

/** Advance a lead through new → contacted → won / lost. */
export async function updateEnquiryStatus(raw: EnquiryStatusInput): Promise<ActionResult> {
  const perm = await checkPermission('enquiries', 'write')
  if (!perm.success) return perm

  const parsed = enquiryStatusSchema.safeParse(raw)
  if (!parsed.success) return { success: false, error: 'Invalid status update' }

  const { error } = await dbc()
    .from('enquiries')
    .update({ status: parsed.data.status })
    .eq('id', parsed.data.id)
  if (error) return { success: false, error: error.message }

  revalidatePath('/enquiries')
  revalidatePath(`/enquiries/${parsed.data.id}`)
  return { success: true }
}

/**
 * Append a timestamped internal note. Never overwrites existing notes — the
 * staff_notes column is an append-only trail, matching the public site.
 */
export async function appendEnquiryNote(raw: EnquiryNoteInput): Promise<ActionResult> {
  const perm = await checkPermission('enquiries', 'write')
  if (!perm.success) return perm

  const parsed = enquiryNoteSchema.safeParse(raw)
  if (!parsed.success) return { success: false, error: 'Note cannot be empty' }

  const db = dbc()
  const { data: existing, error: readErr } = await db
    .from('enquiries').select('staff_notes').eq('id', parsed.data.id).maybeSingle()
  if (readErr) return { success: false, error: readErr.message }
  if (!existing) return { success: false, error: 'Enquiry not found' }

  const ctx = await getCurrentUserContext()
  const who = ctx?.profile.full_name || ctx?.email || 'staff'
  const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ')
  const entry = `[${stamp} · ${who}] ${parsed.data.note}`
  const combined = existing.staff_notes ? `${existing.staff_notes}\n${entry}` : entry

  const { error } = await db
    .from('enquiries').update({ staff_notes: combined }).eq('id', parsed.data.id)
  if (error) return { success: false, error: error.message }

  revalidatePath(`/enquiries/${parsed.data.id}`)
  return { success: true }
}

/**
 * Mark a lead as seen (clears it from the "new enquiries" badge). Called when
 * a staff member opens the detail page. Read-level — viewing clears the alert.
 * No-op if already seen so we don't churn updated_at on every re-open.
 */
export async function markEnquirySeen(id: string): Promise<ActionResult> {
  const perm = await checkPermission('enquiries', 'read')
  if (!perm.success) return perm

  const db = dbc()
  const { data: row } = await db
    .from('enquiries').select('seen_at').eq('id', id).maybeSingle()
  if (row && row.seen_at) return { success: true }

  const { error } = await db
    .from('enquiries').update({ seen_at: new Date().toISOString() }).eq('id', id)
  if (error) return { success: false, error: error.message }

  revalidatePath('/enquiries')
  return { success: true }
}
