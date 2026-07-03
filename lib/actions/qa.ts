'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { checkPermission, getCurrentUserContext } from '@/lib/auth/permissions'
import { normalizePhone } from '@/lib/queries/guest-numbers'
import {
  qaReviewFormSchema, qaSkipSchema,
  type QaReviewFormInput, type QaSkipInput,
} from '@/lib/validators/qa'
import type { ActionResult } from './types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const dbc = () => createClient() as any

async function logHistory(id: string, event: 'created' | 'edited', payload: Record<string, unknown> = {}) {
  try {
    const { error } = await dbc().from('history_log').insert({
      entity_type: 'qa_review', entity_id: id, event, actor: 'system', payload,
    })
    if (error) console.warn(`[history_log] non-fatal: ${error.message}`)
  } catch (err) {
    console.warn('[history_log] non-fatal:', err)
  }
}

interface BookingSlim {
  id: string
  customer_name: string
  customer_phone: string
  status: string
}

async function loadBooking(bookingId: string): Promise<BookingSlim | null> {
  const { data } = await dbc()
    .from('bookings')
    .select('id, customer_name, customer_phone, status')
    .eq('id', bookingId)
    .maybeSingle()
  return (data as BookingSlim | null) ?? null
}

/** Record collected guest feedback for a checked-out booking. Replaces a
 *  prior unreachable/declined attempt; refuses to overwrite completed
 *  feedback so a stay can't be silently re-scored. */
export async function submitQaReview(raw: QaReviewFormInput): Promise<ActionResult> {
  const perm = await checkPermission('qa', 'write')
  if (!perm.success) return perm

  try {
    const input = qaReviewFormSchema.parse(raw)
    const db = dbc()

    const booking = await loadBooking(input.booking_id)
    if (!booking) return { success: false, error: 'Booking not found' }
    if (booking.status !== 'checked_out') {
      return { success: false, error: 'Feedback can only be recorded for checked-out bookings' }
    }

    const ctx = await getCurrentUserContext()
    const row = {
      customer_phone:       normalizePhone(booking.customer_phone) ?? booking.customer_phone,
      customer_name:        booking.customer_name,
      status:               'completed',
      room_service_rating:  input.room_service_rating,
      room_service_comment: input.room_service_comment ?? null,
      food_rating:          input.food_rating,
      food_comment:         input.food_comment ?? null,
      other_issue:          input.other_issue,
      other_comment:        input.other_comment ?? null,
      overall_rating:       input.overall_rating,
      would_return:         input.would_return ?? null,
      reviewed_by:          ctx?.user_id ?? null,
      reviewed_by_name:     ctx?.profile.full_name ?? null,
    }

    const { data: existing } = await db
      .from('qa_reviews')
      .select('id, status')
      .eq('booking_id', input.booking_id)
      .maybeSingle()

    if (existing?.status === 'completed') {
      return { success: false, error: 'Feedback has already been recorded for this stay' }
    }

    if (existing) {
      const { error } = await db.from('qa_reviews').update(row).eq('id', existing.id)
      if (error) return { success: false, error: error.message }
      await logHistory(existing.id, 'edited', { booking_id: input.booking_id, from_status: existing.status })
    } else {
      const { data, error } = await db
        .from('qa_reviews')
        .insert({ booking_id: input.booking_id, ...row })
        .select('id')
        .single()
      if (error) return { success: false, error: error.message }
      await logHistory(data.id, 'created', { booking_id: input.booking_id })
    }

    revalidatePath('/qa')
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to save feedback' }
  }
}

/** Mark a pending call as unreachable/declined so the queue reflects the
 *  attempt. The booking stays retryable until it ages out of the window. */
export async function markQaCallSkipped(raw: QaSkipInput): Promise<ActionResult> {
  const perm = await checkPermission('qa', 'write')
  if (!perm.success) return perm

  try {
    const input = qaSkipSchema.parse(raw)
    const db = dbc()

    const booking = await loadBooking(input.booking_id)
    if (!booking) return { success: false, error: 'Booking not found' }

    const ctx = await getCurrentUserContext()
    const row = {
      customer_phone:   normalizePhone(booking.customer_phone) ?? booking.customer_phone,
      customer_name:    booking.customer_name,
      status:           input.status,
      other_comment:    input.note ?? null,
      reviewed_by:      ctx?.user_id ?? null,
      reviewed_by_name: ctx?.profile.full_name ?? null,
    }

    const { data: existing } = await db
      .from('qa_reviews')
      .select('id, status')
      .eq('booking_id', input.booking_id)
      .maybeSingle()

    if (existing?.status === 'completed') {
      return { success: false, error: 'Feedback has already been recorded for this stay' }
    }

    if (existing) {
      const { error } = await db.from('qa_reviews').update(row).eq('id', existing.id)
      if (error) return { success: false, error: error.message }
    } else {
      const { data, error } = await db
        .from('qa_reviews')
        .insert({ booking_id: input.booking_id, ...row })
        .select('id')
        .single()
      if (error) return { success: false, error: error.message }
      await logHistory(data.id, 'created', { booking_id: input.booking_id, status: input.status })
    }

    revalidatePath('/qa')
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to update call status' }
  }
}
