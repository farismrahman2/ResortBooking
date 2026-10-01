'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUserContext } from '@/lib/auth/permissions'
import { flagAlert } from '@/lib/auth/alerts'
import { isMissingRelation } from '@/lib/supabase/errors'
import { findBlockBookingConflicts } from '@/lib/queries/availability'
import { getBlock } from '@/lib/queries/room-blocks'
import { reasonLabel, BLOCK_REASONS, type RoomBlock, type BlockConflict } from '@/lib/engine/blocks'
import { addDaysIso, todayDhaka } from '@/lib/dates'
import type { ActionResult, ActionData } from './types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createClient() as any

const ISO = /^\d{4}-\d{2}-\d{2}$/
const BlockSchema = z.object({
  all_rooms:    z.boolean().default(false),
  room_types:   z.array(z.string().min(1)).default([]),
  room_numbers: z.array(z.string().min(1)).default([]),
  start_date:   z.string().regex(ISO, 'Pick a start date'),
  end_date:     z.string().regex(ISO).nullable().default(null),
  weekdays:     z.array(z.number().int().min(0).max(6)).nullable().default(null),
  reason_kind:  z.enum(BLOCK_REASONS.map((r) => r.value) as [string, ...string[]]),
  reason:       z.string().trim().max(300).nullable().default(null),
}).superRefine((b, ctx) => {
  if (!b.all_rooms && b.room_types.length === 0 && b.room_numbers.length === 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Choose what to block — the whole property, room types or specific rooms.' })
  }
  if (b.end_date && b.end_date < b.start_date) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'The end date is before the start date.' })
  }
})
export type RoomBlockInput = z.input<typeof BlockSchema>

const MIGRATION_HINT = 'Run migrations/room-blocks/001_room_blocks.sql to start blocking rooms.'

/** Admins only — the room list is the business's inventory. */
async function requireAdmin() {
  const ctx = await getCurrentUserContext()
  if (ctx?.profile.role.slug !== 'admin') return { ctx: null, error: 'Only an admin can block or release rooms.' }
  return { ctx, error: null }
}

/** "GCR-B-2026-1100 on 6 Oct (302)" lines, at most a handful. */
function conflictMessage(conflicts: BlockConflict[]): string {
  const byRef = new Map<string, { dates: string[]; rooms: Set<string> }>()
  for (const c of conflicts) {
    const cur = byRef.get(c.ref) ?? { dates: [], rooms: new Set<string>() }
    if (!cur.dates.includes(c.date)) cur.dates.push(c.date)
    c.rooms.forEach((r) => cur.rooms.add(r))
    byRef.set(c.ref, cur)
  }
  const lines = [...byRef.entries()].slice(0, 6).map(([ref, v]) =>
    `${ref} — ${v.dates.length === 1 ? v.dates[0] : `${v.dates[0]} to ${v.dates[v.dates.length - 1]}`} (${[...v.rooms].join(', ')})`)
  const more = byRef.size > 6 ? ` and ${byRef.size - 6} more` : ''
  return `These rooms are already booked inside the block: ${lines.join('; ')}${more}. ` +
         `Move or cancel those first, or block a different range.`
}

function describe(b: Pick<RoomBlock, 'all_rooms' | 'room_types' | 'room_numbers' | 'start_date' | 'end_date' | 'weekdays'>): string {
  const what = [
    b.all_rooms ? 'whole property' : null,
    b.room_types.length ? b.room_types.map((t) => t.replace(/_/g, ' ')).join(', ') : null,
    b.room_numbers.length ? `rooms ${b.room_numbers.join(', ')}` : null,
  ].filter(Boolean).join(' + ')
  const when = b.end_date ? `${b.start_date} to ${b.end_date}` : `from ${b.start_date}, until further notice`
  const days = b.weekdays?.length ? ` (${b.weekdays.map((d) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d]).join(', ')} only)` : ''
  return `${what}, ${when}${days}`
}

function refresh() {
  revalidatePath('/settings/room-blocks')
  revalidatePath('/availability')
}

export async function createRoomBlock(input: RoomBlockInput): Promise<ActionData<{ id: string }> & { conflicts?: BlockConflict[] }> {
  const { ctx, error: denied } = await requireAdmin()
  if (denied) return { success: false, error: denied }
  const parsed = BlockSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }
  const b = parsed.data

  const conflicts = await findBlockBookingConflicts({ id: 'new', ...b })
  if (conflicts.length) return { success: false, error: conflictMessage(conflicts), conflicts }

  const { data, error } = await db().from('room_blocks')
    .insert({ ...b, weekdays: b.weekdays?.length ? b.weekdays : null, created_by: ctx!.user_id })
    .select('id').single()
  if (error) return { success: false, error: isMissingRelation(error) ? MIGRATION_HINT : error.message }

  await flagAlert({
    event_type: 'room_block_created', entity_type: 'room_block', entity_id: data.id,
    summary: `Rooms blocked: ${describe(b)} — ${reasonLabel(b)}`,
    payload: { ...b }, created_by: ctx!.user_id,
  })
  refresh()
  return { success: true, data: { id: data.id } }
}

export async function updateRoomBlock(id: string, input: RoomBlockInput): Promise<ActionResult & { conflicts?: BlockConflict[] }> {
  const { ctx, error: denied } = await requireAdmin()
  if (denied) return { success: false, error: denied }
  const parsed = BlockSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }
  const before = await getBlock(id)
  if (!before) return { success: false, error: 'Block not found' }
  const b = parsed.data

  const conflicts = await findBlockBookingConflicts({ id, ...b })
  if (conflicts.length) return { success: false, error: conflictMessage(conflicts), conflicts }

  const { error } = await db().from('room_blocks')
    .update({ ...b, weekdays: b.weekdays?.length ? b.weekdays : null, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) return { success: false, error: error.message }

  await flagAlert({
    event_type: 'room_block_changed', entity_type: 'room_block', entity_id: id,
    summary: `Room block changed: was ${describe(before)}; now ${describe(b)} — ${reasonLabel(b)}`,
    payload: { before, after: b }, created_by: ctx!.user_id,
  })
  refresh()
  return { success: true }
}

/**
 * Put the rooms back on sale from today. A block that has not started yet is
 * removed outright; one already running ends yesterday, so its history stays.
 */
export async function releaseRoomBlock(id: string): Promise<ActionResult> {
  const { ctx, error: denied } = await requireAdmin()
  if (denied) return { success: false, error: denied }
  const b = await getBlock(id)
  if (!b) return { success: false, error: 'Block not found' }
  const today = todayDhaka()
  if (b.end_date && b.end_date < today) return { success: false, error: 'This block has already ended.' }

  const { error } = b.start_date >= today
    ? await db().from('room_blocks').delete().eq('id', id)
    : await db().from('room_blocks')
        .update({ end_date: addDaysIso(today, -1), released_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', id)
  if (error) return { success: false, error: error.message }

  await flagAlert({
    event_type: 'room_block_released', entity_type: 'room_block', entity_id: id,
    summary: `Rooms back on sale from ${today}: ${describe(b)} — ${reasonLabel(b)}`,
    payload: { block: b, released_on: today }, created_by: ctx!.user_id,
  })
  refresh()
  return { success: true }
}
