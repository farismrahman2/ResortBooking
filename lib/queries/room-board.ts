import { createClient } from '@/lib/supabase/server'
import { getDailyReport } from '@/lib/queries/daily-report'
import { listBlocksOverlapping } from '@/lib/queries/room-blocks'
import { getRoomInventory, getSettings } from '@/lib/queries/settings'
import { blockedNumbersOn } from '@/lib/engine/blocks'
import { buildRoomBoard, type BoardStayInput, type RoomBoard } from '@/lib/engine/room-board'
import { MAPPED_ROOMS } from '@/lib/config/room-map'
import { internalHandoverLabel } from '@/lib/settings/handover'
import { addDaysIso } from '@/lib/dates'

/** Confirmed, not-yet-converted quotes covering the date — they hold rooms. */
async function quoteHolds(date: string): Promise<BoardStayInput[]> {
  const db = createClient() as any   // eslint-disable-line @typescript-eslint/no-explicit-any
  const { data } = await db.from('quotes')
    .select('id, quote_number, customer_name, customer_phone, package_type, visit_date, check_out_date, adults, children_paid, children_free, drivers, quote_rooms(room_type, qty, room_numbers, evening_rooms)')
    .eq('status', 'confirmed').is('converted_to_booking_id', null)
    .lte('visit_date', date)
    .or(`check_out_date.gte.${date},and(check_out_date.is.null,visit_date.eq.${date})`)
  return ((data ?? []) as any[])   // eslint-disable-line @typescript-eslint/no-explicit-any
    .filter((q) => q.package_type === 'daylong' || q.package_type === 'night')
    .map((q) => ({
      kind: 'quote' as const, id: q.id, ref: q.quote_number, name: q.customer_name, phone: q.customer_phone,
      package_type: q.package_type, visit_date: q.visit_date, check_out_date: q.check_out_date,
      adults: Number(q.adults ?? 0), children: Number(q.children_paid ?? 0) + Number(q.children_free ?? 0), drivers: Number(q.drivers ?? 0),
      rooms: (q.quote_rooms ?? []).map((r: any) => ({ room_type: r.room_type, qty: Number(r.qty ?? 0), room_numbers: r.room_numbers ?? [], evening_rooms: r.evening_rooms ?? [] })),   // eslint-disable-line @typescript-eslint/no-explicit-any
    }))
}

export interface RoomBoardData {
  date:          string
  board:         RoomBoard
  handoverLabel: string
}

/** Everything the Room board draws for one date, from the same sources as
 *  the daily room sheet and availability. */
export async function getRoomBoard(date: string): Promise<RoomBoardData> {
  const [rows, blocks, inventory, quotes, settings] = await Promise.all([
    getDailyReport(date), listBlocksOverlapping(date, addDaysIso(date, 1)), getRoomInventory(), quoteHolds(date), getSettings(),
  ])
  const stays: BoardStayInput[] = rows.map((r) => ({
    kind: 'booking', id: r.booking_id, ref: r.booking_number, name: r.customer_name, phone: r.customer_phone,
    package_type: r.package_type === 'daylong' ? 'daylong' : 'night', package_name: r.package_name, group: !!r.group_segment,
    visit_date: r.visit_date, check_out_date: r.check_out_date,
    adults: r.adults, children: r.children_paid + r.children_free, drivers: r.drivers,
    status: r.status, remaining: r.remaining, corporate: r.is_corporate, company: r.company_name,
    rooms: r.rooms.map((x) => ({ room_type: x.room_type, qty: x.qty, room_numbers: x.room_numbers, evening_rooms: x.evening_rooms })),
  }))
  const blocked = blockedNumbersOn(blocks, [date], inventory)
  const board = buildRoomBoard([...stays, ...quotes], blocked, [...MAPPED_ROOMS, 'Conference'], date)
  return { date, board, handoverLabel: internalHandoverLabel(settings) }
}
