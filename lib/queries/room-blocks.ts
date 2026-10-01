import { createClient } from '@/lib/supabase/server'
import { isMissingRelation } from '@/lib/supabase/errors'
import type { RoomBlock } from '@/lib/engine/blocks'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createClient() as any

export interface RoomBlockRow extends RoomBlock {
  created_by:  string | null
  created_at:  string
  updated_at:  string
  released_at: string | null
}

function normalise(r: any): RoomBlockRow {   // eslint-disable-line @typescript-eslint/no-explicit-any
  return {
    ...r,
    all_rooms:    Boolean(r.all_rooms),
    room_types:   r.room_types ?? [],
    room_numbers: r.room_numbers ?? [],
    weekdays:     r.weekdays && r.weekdays.length ? r.weekdays.map(Number) : null,
  }
}

/**
 * Blocks in force at any point of [from, to). An absent table means no
 * blocks yet — never a broken availability check.
 */
export async function listBlocksOverlapping(from: string, to: string, excludeId?: string): Promise<RoomBlockRow[]> {
  let q = db().from('room_blocks').select('*')
    .lt('start_date', to)
    .or(`end_date.is.null,end_date.gte.${from}`)
  if (excludeId) q = q.neq('id', excludeId)
  const { data, error } = await q
  if (error) {
    if (isMissingRelation(error)) return []
    console.warn('[room_blocks] non-fatal:', error.message)
    return []
  }
  return ((data ?? []) as unknown[]).map(normalise)
}

/** Every block, newest first — for the management page. */
export async function listAllBlocks(): Promise<{ rows: RoomBlockRow[]; missing: boolean }> {
  const { data, error } = await db().from('room_blocks').select('*')
    .order('start_date', { ascending: false }).limit(500)
  if (error) return { rows: [], missing: isMissingRelation(error) }
  return { rows: ((data ?? []) as unknown[]).map(normalise), missing: false }
}

export async function getBlock(id: string): Promise<RoomBlockRow | null> {
  const { data } = await db().from('room_blocks').select('*').eq('id', id).maybeSingle()
  return data ? normalise(data) : null
}
