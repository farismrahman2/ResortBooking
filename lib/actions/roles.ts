'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { updateRolePermissionsSchema } from '@/lib/validators/roles'
import { requirePermission, getCurrentUserContext } from '@/lib/auth/permissions'
import type { ActionResult } from './types'
import type { PermissionLevel } from '@/lib/supabase/types'

async function logHistory(
  entityId: string,
  event: 'created' | 'edited',
  action: string,
  payload: Record<string, unknown> = {},
) {
  try {
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any
    const { error } = await db.from('history_log').insert({
      entity_type: 'role',
      entity_id:   entityId,
      event,
      actor:       'system',
      payload:     { action, ...payload },
    })
    if (error) console.warn(`[history_log] non-fatal: ${error.message}`)
  } catch (err) {
    console.warn(`[history_log] non-fatal:`, err)
  }
}

/**
 * Updates the permission matrix for a single role.
 *
 * Defense-in-depth: even if the validator allows it, we never let the admin
 * role's `settings` permission drop below `write` — that would lock all admins
 * out of /settings and they couldn't undo the change.
 */
export async function updateRolePermissions(
  roleId: string,
  input: unknown,
): Promise<ActionResult> {
  try {
    await requirePermission('settings', 'write')
    const parsed = updateRolePermissionsSchema.parse(input)

    const ctx = await getCurrentUserContext()
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any

    // Look up role + module slugs to enforce the admin guard
    const { data: role } = await db.from('roles').select('id, slug').eq('id', roleId).maybeSingle()
    if (!role) return { success: false, error: 'Role not found' }

    if (role.slug === 'admin') {
      const { data: settingsModule } = await db
        .from('modules').select('id').eq('slug', 'settings').single()
      const newSettingsLevel = settingsModule?.id ? parsed.permissions[settingsModule.id] : undefined
      if (newSettingsLevel && newSettingsLevel !== 'write') {
        return {
          success: false,
          error:   'Admin must retain write access to Settings — this would lock all admins out.',
        }
      }
    }

    // One batch UPSERT on UNIQUE(role_id, module_id). The old per-row
    // select-then-write loop made ~34 sequential round trips per save and
    // could stop halfway, leaving the grid part-old part-new.
    const rows = Object.entries(parsed.permissions).map(([moduleId, level]) => ({
      role_id:    roleId,
      module_id:  moduleId,
      level:      level as PermissionLevel,
      updated_by: ctx?.user_id ?? null,
    }))

    if (rows.length > 0) {
      const { error } = await db
        .from('role_permissions')
        .upsert(rows, { onConflict: 'role_id,module_id' })
      if (error) return { success: false, error: error.message }
    }

    await logHistory(roleId, 'edited', 'role_permissions_updated', {
      role_slug:        role.slug,
      permission_count: rows.length,
    })

    revalidatePath('/settings/roles')
    revalidatePath(`/settings/roles/${role.slug}`)
    return { success: true }
  } catch (err) {
    // requirePermission redirects on denial; that throw is Next control flow,
    // not a failure — swallowing it here turned the redirect into a
    // "NEXT_REDIRECT" error toast.
    if (err && typeof err === 'object' && 'digest' in err
      && typeof (err as { digest?: unknown }).digest === 'string'
      && ((err as { digest: string }).digest).startsWith('NEXT_')) throw err
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}
