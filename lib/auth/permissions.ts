import { cache } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
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

const ALL_MODULES: ModuleSlug[] = ['bookings', 'checkout', 'expenses', 'hr', 'reports', 'settings', 'availability']

function emptyPermissionMap(): Record<ModuleSlug, PermissionLevel> {
  const m = {} as Record<ModuleSlug, PermissionLevel>
  for (const slug of ALL_MODULES) m[slug] = 'none'
  return m
}

export const getCurrentUserContext = cache(async (): Promise<UserContext | null> => {
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any
  const { data } = await supabase.auth.getUser()
  if (!data?.user) return null

  try {
    const { data: profile, error: profileErr } = await db
      .from('user_profiles')
      .select(`
        user_id, full_name, email, role_id, is_active, phone,
        created_by, created_at, updated_at, last_login_at,
        role:roles!inner (id, slug, display_name)
      `)
      .eq('user_id', data.user.id)
      .maybeSingle()

    if (profileErr || !profile) {
      // Migration not run yet, or profile missing — surface as no-permissions
      // (auth still ok). The caller can decide what to do; sidebar / pages will
      // show /403 for module-protected routes.
      return null
    }

    if (!profile.is_active) {
      // Deactivated user — treat as logged out for permission purposes
      return null
    }

    const { data: perms, error: permsErr } = await db
      .from('role_permissions')
      .select(`
        level,
        module:modules!inner (slug)
      `)
      .eq('role_id', profile.role_id)

    if (permsErr) return null

    const permissions = emptyPermissionMap()
    for (const p of (perms ?? []) as Array<{ level: PermissionLevel; module: { slug: ModuleSlug } }>) {
      permissions[p.module.slug] = p.level
    }

    return {
      user_id: data.user.id,
      email:   data.user.email ?? profile.email,
      profile: profile as UserContext['profile'],
      permissions,
    }
  } catch {
    return null
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
