import { cache } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { cachedRef } from '@/lib/cache'
import { withDeadline, isTransientFailure } from '@/lib/supabase/deadline'
import type { ActionResult } from '@/lib/actions/types'
import type {
  ModuleSlug,
  PermissionLevel,
  RoleRow,
  UserProfileRow,
} from '@/lib/supabase/types'

export type { ModuleSlug, PermissionLevel } from '@/lib/supabase/types'

/**
 * The full request-scoped user context. `cache()` ensures we hit the DB at
 * most once per request even if the helper is called from multiple places.
 *
 * `null` when the user is not logged in OR when the underlying tables don't
 * exist yet (e.g. migration hasn't been run on a fresh project). The latter
 * is handled gracefully so unmigrated installs still load /login + diagnose.
 */
export interface UserContext {
  user_id: string
  email: string
  profile: UserProfileRow & { role: Pick<RoleRow, 'id' | 'slug' | 'display_name'> }
  permissions: Record<ModuleSlug, PermissionLevel>
}

const ALL_MODULES: ModuleSlug[] = ['bookings', 'checkout', 'expenses', 'hr', 'reports', 'settings', 'availability', 'attendance', 'coffee_shop', 'inventory', 'crm', 'fixed_assets', 'qa', 'menus', 'enquiries', 'field_visits', 'kitchen']

function emptyPermissionMap(): Record<ModuleSlug, PermissionLevel> {
  const m = {} as Record<ModuleSlug, PermissionLevel>
  for (const slug of ALL_MODULES) m[slug] = 'none'
  return m
}

/** Module slug → level for one role. Shared across users and requests. */
const rolePermissionMap = (roleId: string) => cachedRef<Record<string, PermissionLevel>>(
  `role-permissions:${roleId}`,
  async (db) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (db as any)
      .from('role_permissions')
      .select('level, module:modules!inner (slug)')
      .eq('role_id', roleId)
    if (error) throw new Error(`rolePermissionMap: ${error.message}`)
    const out: Record<string, PermissionLevel> = {}
    for (const r of (data ?? []) as Array<{ level: PermissionLevel; module: { slug: string } }>) out[r.module.slug] = r.level
    return out
  },
  { tags: ['role-permissions'], revalidate: 300 },
)()

/** Supabase could not be reached: send the person to the outage page (which
 *  retries by itself) — never treat it as "signed out" or "no permissions",
 *  which used to show a misleading "Access denied". */
function databaseUnreachable(): never {
  redirect('/unavailable')
}

export const getCurrentUserContext = cache(async (): Promise<UserContext | null> => {
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  // Capped, retries included — a slow Supabase must never hang the page.
  const auth = await withDeadline(supabase.auth.getUser(), 10000, 'session check').catch((e) => ({ data: { user: null }, error: e }))
  if (isTransientFailure(auth.error)) databaseUnreachable()
  const user = auth.data?.user
  if (!user) return null

  // The per-user part is one small row; the role's permission map is the
  // same for everyone holding the role and changes a few times a year, so
  // it comes from a shared cache (busted by updateRolePermissions).
  const res = await withDeadline<any>(db   // eslint-disable-line @typescript-eslint/no-explicit-any
    .from('user_profiles')
    .select(`
      user_id, full_name, email, role_id, is_active, phone,
      created_by, created_at, updated_at, last_login_at,
      role:roles!inner ( id, slug, display_name )
    `)
    .eq('user_id', user.id)
    .maybeSingle(), 8000, 'profile lookup').catch((e: unknown) => ({ data: null, error: e }))
  if (isTransientFailure(res.error)) databaseUnreachable()
  const profile = res.data
  // Migration not run yet, or profile missing — no permissions (auth is ok).
  if (res.error || !profile) return null
  // Deactivated user — treat as logged out for permission purposes.
  if (!profile.is_active) return null

  let levels: Record<string, PermissionLevel>
  try {
    levels = await withDeadline(rolePermissionMap(profile.role_id), 8000, 'role permissions')
  } catch {
    // An empty map here used to mean "Access denied" everywhere.
    databaseUnreachable()
  }
  const permissions = emptyPermissionMap()
  for (const [slug, level] of Object.entries(levels)) permissions[slug as ModuleSlug] = level

  return {
    user_id: user.id,
    email:   user.email ?? profile.email,
    profile: profile as UserContext['profile'],
    permissions,
  }
})

/**
 * Boolean check. `'none'` is always satisfied (no-op). `'read'` accepts
 * `read | write`. `'write'` requires `write`.
 */
export async function hasPermission(
  module: ModuleSlug,
  required: PermissionLevel,
): Promise<boolean> {
  if (required === 'none') return true
  const ctx = await getCurrentUserContext()
  if (!ctx) return false
  const level = ctx.permissions[module] ?? 'none'
  if (required === 'read')  return level === 'read' || level === 'write'
  if (required === 'write') return level === 'write'
  return false
}

/** Server-component / page-level guard. Redirects to /403 if not satisfied. */
export async function requirePermission(
  module: ModuleSlug,
  required: PermissionLevel,
): Promise<UserContext> {
  const ctx = await getCurrentUserContext()
  if (!ctx) redirect('/login')
  if (required === 'none') return ctx
  const level = ctx.permissions[module] ?? 'none'
  const ok =
    (required === 'read' && (level === 'read' || level === 'write')) ||
    (required === 'write' && level === 'write')
  if (!ok) redirect(`/403?from=${encodeURIComponent(module)}`)
  return ctx
}

/**
 * Server-action guard. Returns `ActionResult` instead of redirecting so the
 * client can show a toast.
 */
export async function checkPermission(
  module: ModuleSlug,
  required: PermissionLevel,
): Promise<ActionResult> {
  const ok = await hasPermission(module, required)
  if (!ok) return { success: false, error: `You don't have ${required} access to ${module}.` }
  return { success: true }
}

/** Convenience: true if the current user is the admin role. */
export async function isAdmin(): Promise<boolean> {
  const ctx = await getCurrentUserContext()
  return ctx?.profile.role.slug === 'admin'
}
