/**
 * Evening room handover — two times, one event.
 *
 * A night booking's evening rooms free up when that day's day guests leave at
 * 6 PM, and that is the time the availability board and the daily report work
 * from. The guest is told a later time, so housekeeping has the room ready
 * before anyone knocks on the door — 7 PM by default.
 *
 * So: `internalHandoverTime` for anything the staff reads, `guestHandoverTime`
 * for the quotation, the confirmation and the WhatsApp message. Neither drives
 * availability itself — the halves engine works in whole day/night halves and
 * never reads a clock.
 */
import type { SettingsMap } from '@/lib/supabase/types'
import { to12Hour } from '@/lib/formatters/whatsapp'

export const DEFAULT_INTERNAL_HANDOVER = '18:00'
export const DEFAULT_GUEST_HANDOVER    = '19:00'

/** When the room actually frees up. Staff views. */
export function internalHandoverTime(settings: SettingsMap): string {
  return settings['evening_handover_time'] ?? DEFAULT_INTERNAL_HANDOVER
}

/** What we tell the guest. Quotes, confirmations, WhatsApp. */
export function guestHandoverTime(settings: SettingsMap): string {
  return settings['evening_handover_guest_time'] ?? DEFAULT_GUEST_HANDOVER
}

/** 'From 6:00 PM' for staff. */
export function internalHandoverLabel(settings: SettingsMap): string {
  return to12Hour(internalHandoverTime(settings))
}

/** 'From 7:00 PM' for the guest. */
export function guestHandoverLabel(settings: SettingsMap): string {
  return to12Hour(guestHandoverTime(settings))
}
