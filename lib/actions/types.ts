import type { DuplicateMatch } from '@/lib/queries/duplicate-bookings'

export type ActionResult =
  | { success: true }
  | { success: false; error: string; duplicate?: { existing: DuplicateMatch[] } }

export type ActionData<T> =
  | { success: true; data: T }
  | { success: false; error: string; duplicate?: { existing: DuplicateMatch[] } }
