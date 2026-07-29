import type { DuplicateMatch } from '@/lib/queries/duplicate-bookings'

/** Room numbers lost to a concurrent booking between quote confirm and convert. */
export interface RoomConflict { rooms: string[] }

export type ActionResult =
  | { success: true }
  | { success: false; error: string; duplicate?: { existing: DuplicateMatch[] }; conflict?: RoomConflict }

export type ActionData<T> =
  | { success: true; data: T }
  | { success: false; error: string; duplicate?: { existing: DuplicateMatch[] }; conflict?: RoomConflict }
