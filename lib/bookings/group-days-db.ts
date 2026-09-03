/**
 * Persisting a group itinerary — shared by the quote and booking actions.
 *
 * Server-only (takes a Supabase client), deliberately NOT a 'use server'
 * module: these are helpers the actions call, not actions themselves.
 */

import { sortSegments, type GroupSegment } from './group-itinerary'

type Kind = 'quote' | 'booking'

const TABLES: Record<Kind, { days: string; rooms: string; fk: string; roomFk: string }> = {
  quote:   { days: 'quote_days',   rooms: 'quote_day_rooms',   fk: 'quote_id',   roomFk: 'quote_day_id' },
  booking: { days: 'booking_days', rooms: 'booking_day_rooms', fk: 'booking_id', roomFk: 'booking_day_id' },
}

/**
 * Insert every segment and its rooms. Returns an error message, or null.
 * Rows are written in itinerary order so sort_order reads naturally.
 */
export async function insertGroupDays(
  db: any,   // eslint-disable-line @typescript-eslint/no-explicit-any
  kind: Kind,
  parentId: string,
  days: GroupSegment[],
): Promise<string | null> {
  const t = TABLES[kind]
  const ordered = sortSegments(days)
  for (let i = 0; i < ordered.length; i++) {
    const d = ordered[i]
    const { data: row, error } = await db.from(t.days).insert({
      [t.fk]:        parentId,
      day_date:      d.day_date,
      stay_kind:     d.stay_kind,
      adults:        d.adults,
      adults_comp:   d.adults_comp,
      children_paid: d.children_paid,
      children_free: d.children_free,
      drivers:       d.drivers,
      extra_beds:    d.extra_beds,
      notes:         d.notes ?? null,
      sort_order:    i,
    }).select('id').single()
    if (error || !row) return `Could not save the itinerary for ${d.day_date}: ${error?.message ?? 'insert failed'}`

    const rooms = d.rooms.filter((r) => r.qty > 0)
    if (rooms.length === 0) continue
    const { error: roomErr } = await db.from(t.rooms).insert(rooms.map((r) => ({
      [t.roomFk]:   row.id,
      room_type:    r.room_type,
      qty:          r.qty,
      unit_price:   r.unit_price,
      room_numbers: r.room_numbers ?? [],
      evening_rooms: (r.evening_rooms ?? []).filter((n) => (r.room_numbers ?? []).includes(n)),
    })))
    if (roomErr) return `Could not save the rooms for ${d.day_date}: ${roomErr.message}`
  }
  return null
}

/**
 * Replace the itinerary wholesale, restoring the old one if the new one
 * fails to land — the same discipline the room tables get, because an
 * itinerary that half-saved is invisible to every availability check.
 */
export async function replaceGroupDays(
  db: any,   // eslint-disable-line @typescript-eslint/no-explicit-any
  kind: Kind,
  parentId: string,
  days: GroupSegment[],
): Promise<string | null> {
  const t = TABLES[kind]
  const { data: old } = await db.from(t.days)
    .select(`*, rooms:${t.rooms}(*)`)
    .eq(t.fk, parentId)

  const { error: delErr } = await db.from(t.days).delete().eq(t.fk, parentId)   // cascades to rooms
  if (delErr) return `Could not update the itinerary: ${delErr.message}`

  const err = await insertGroupDays(db, kind, parentId, days)
  if (!err) return null

  // Best-effort restore of what was there before.
  if (old?.length) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const restore: GroupSegment[] = (old as any[]).map((r) => ({
      day_date: r.day_date, stay_kind: r.stay_kind,
      adults: r.adults ?? 0, adults_comp: r.adults_comp ?? 0,
      children_paid: r.children_paid ?? 0, children_free: r.children_free ?? 0,
      drivers: r.drivers ?? 0, extra_beds: r.extra_beds ?? 0, notes: r.notes ?? null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      rooms: (r.rooms ?? []).map((x: any) => ({
        room_type: x.room_type, qty: x.qty ?? 0, unit_price: x.unit_price ?? 0, room_numbers: x.room_numbers ?? [],
        evening_rooms: x.evening_rooms ?? [],
      })),
    }))
    await insertGroupDays(db, kind, parentId, restore)
  }
  return `${err} — the itinerary was left unchanged.`
}
