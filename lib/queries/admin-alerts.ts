import { createClient } from '@/lib/supabase/server'
import type { AdminAlertRow, AdminAlertEvent } from '@/lib/supabase/types'

export interface AdminAlertWithUser extends AdminAlertRow {
  created_user_name?:    string | null
  acknowledged_user_name?: string | null
}

export async function listAdminAlerts(opts: {
  filter?: 'unread' | 'all' | AdminAlertEvent
  limit?:  number
} = {}): Promise<AdminAlertWithUser[]> {
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  let query = db
    .from('admin_alerts')
    .select(`
      *,
      created_user:user_profiles!admin_alerts_created_by_fkey (full_name),
      acknowledged_user:user_profiles!admin_alerts_acknowledged_by_fkey (full_name)
    `)
    .order('created_at', { ascending: false })
    .limit(opts.limit ?? 200)

  if (opts.filter === 'unread') query = query.is('acknowledged_at', null)
  else if (opts.filter && opts.filter !== 'all') query = query.eq('event_type', opts.filter)

  // The user_profiles FKs may not exist as named foreign keys; fall back to a
  // simpler query if the embed errors.
  let { data, error } = await query
  if (error) {
    const fallback = await db
      .from('admin_alerts').select('*').order('created_at', { ascending: false }).limit(opts.limit ?? 200)
    data = fallback.data
    error = fallback.error
    if (error) throw new Error(`listAdminAlerts: ${error.message}`)
  }

  return (data ?? []).map((r: any) => ({
    ...r,
    created_user_name:      r.created_user?.full_name      ?? null,
    acknowledged_user_name: r.acknowledged_user?.full_name ?? null,
  })) as AdminAlertWithUser[]
}
