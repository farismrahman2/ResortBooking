import { createClient } from '@/lib/supabase/server'
import type {
  RoleRow,
  ModuleRow,
  RoleSlug,
  RoleWithPermissions,
} from '@/lib/supabase/types'

export async function listRoles(): Promise<RoleRow[]> {
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any
  const { data, error } = await db
    .from('roles')
    .select('*')
    .order('display_order', { ascending: true })
  if (error) throw new Error(`listRoles: ${error.message}`)
  return (data ?? []) as RoleRow[]
}

export async function getRoleBySlug(slug: RoleSlug): Promise<RoleRow | null> {
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any
  const { data } = await db.from('roles').select('*').eq('slug', slug).maybeSingle()
  return (data ?? null) as RoleRow | null
}

export async function listModules(): Promise<ModuleRow[]> {
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any
  const { data, error } = await db
    .from('modules')
    .select('*')
    .order('display_order', { ascending: true })
  if (error) throw new Error(`listModules: ${error.message}`)
  return (data ?? []) as ModuleRow[]
}

export async function getRoleWithPermissions(slug: RoleSlug): Promise<RoleWithPermissions | null> {
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any
  const { data: role } = await db.from('roles').select('*').eq('slug', slug).maybeSingle()
  if (!role) return null
  const { data: perms } = await db
    .from('role_permissions')
    .select(`
      *,
      module:modules!inner (id, slug, display_name)
    `)
    .eq('role_id', role.id)
  return {
    ...role,
    permissions: (perms ?? []) as RoleWithPermissions['permissions'],
  } as RoleWithPermissions
}

/** Headcount per role — for the role cards. */
export async function getRoleHeadcounts(): Promise<Record<string, number>> {
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any
  const { data } = await db
    .from('user_profiles')
    .select('role_id')
    .eq('is_active', true)
  const counts: Record<string, number> = {}
  for (const r of (data ?? []) as { role_id: string }[]) {
    counts[r.role_id] = (counts[r.role_id] ?? 0) + 1
  }
  return counts
}
