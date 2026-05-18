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

    // UPSERT each permission row
    const rows = Object.entries(parsed.permissions).map(([moduleId, level]) => ({
      role_id:    roleId,
      module_id:  moduleId,
      level:      level as PermissionLevel,
      updated_by: ctx?.user_id ?? null,
    }))

    // We do per-row upsert so we get clear error messages per failure
    for (const row of rows) {
      const { data: existing } = await db
        .from('role_permissions')
        .select('id, level')
        .eq('role_id', row.role_id)
        .eq('module_id', row.module_id)
        .maybeSingle()

      if (existing) {
        if (existing.level === row.level) continue   // no-op
        const { error } = await db
          .from('role_permissions')
          .update({ level: row.level, updated_by: row.updated_by })
          .eq('id', existing.id)
        if (error) return { success: false, error: error.message }
      } else {
        const { error } = await db.from('role_permissions').insert(row)
        if (error) return { success: false, error: error.message }
      }
    }

    await logHistory(roleId, 'edited', 'role_permissions_updated', {
      role_slug:        role.slug,
      permission_count: rows.length,
    })

    revalidatePath('/settings/roles')
    revalidatePath(`/settings/roles/${role.slug}`)
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}
