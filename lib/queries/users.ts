import { createClient } from '@/lib/supabase/server'
import type { UserProfileWithRole, RoleSlug } from '@/lib/supabase/types'

export async function listUsers(opts: {
  includeInactive?: boolean
} = {}): Promise<UserProfileWithRole[]> {
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  let query = db
    .from('user_profiles')
    .select(`
      user_id, full_name, email, role_id, is_active, phone, sales_start_date,
      created_by, created_at, updated_at, last_login_at,
      role:roles!inner (id, slug, display_name)
    `)
    .order('full_name', { ascending: true })

  if (!opts.includeInactive) query = query.eq('is_active', true)

  const { data, error } = await query
  if (error) throw new Error(`listUsers: ${error.message}`)
  return (data ?? []) as UserProfileWithRole[]
}

export async function getUserById(userId: string): Promise<UserProfileWithRole | null> {
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any
  const { data } = await db
    .from('user_profiles')
    .select(`
      user_id, full_name, email, role_id, is_active, phone, sales_start_date,
      created_by, created_at, updated_at, last_login_at,
      role:roles!inner (id, slug, display_name)
    `)
    .eq('user_id', userId)
    .maybeSingle()
  return (data ?? null) as UserProfileWithRole | null
}

/**
 * Counts active admin users — used by the last-admin guard. The deactivate /
 * change-role actions call this to refuse operations that would leave zero admins.
 */
export async function countActiveAdmins(): Promise<number> {
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any
  const { count } = await db
    .from('user_profiles')
    .select('user_id, role:roles!inner (slug)', { count: 'exact', head: false })
    .eq('is_active', true)
    .eq('role.slug', 'admin' satisfies RoleSlug)
  return count ?? 0
}
