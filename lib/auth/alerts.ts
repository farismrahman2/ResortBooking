import { createClient } from '@/lib/supabase/server'
import type { AdminAlertEvent } from '@/lib/supabase/types'

/**
 * Best-effort alert insert. Mirrors the logHistory pattern — never blocks
 * the user-facing operation if the table doesn't exist or RLS rejects.
 */
export async function flagAlert(args: {
  event_type:  AdminAlertEvent
  entity_type: string
  entity_id:   string
  summary:     string
  payload?:    Record<string, unknown>
  created_by?: string | null
}): Promise<void> {
  try {
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any
    const { error } = await db.from('admin_alerts').insert({
      event_type:  args.event_type,
      entity_type: args.entity_type,
      entity_id:   args.entity_id,
      summary:     args.summary,
      payload:     args.payload ?? null,
      created_by:  args.created_by ?? null,
    })
    if (error) console.warn(`[admin_alerts] non-fatal: ${error.message}`)
  } catch (err) {
    console.warn(`[admin_alerts] non-fatal:`, err)
  }
}

/** Returns the count of unacknowledged alerts. Used for the sidebar badge. */
export async function getUnreadAlertCount(): Promise<number> {
  try {
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any
    const { count } = await db
      .from('admin_alerts')
      .select('id', { count: 'exact', head: true })
      .is('acknowledged_at', null)
    return count ?? 0
  } catch {
    return 0
  }
}
