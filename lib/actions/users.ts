'use server'

import { revalidatePath } from 'next/cache'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import {
  newUserSchema,
  updateUserSchema,
  resetPasswordSchema,
  changeRoleSchema,
} from '@/lib/validators/users'
import { requirePermission, getCurrentUserContext } from '@/lib/auth/permissions'
import { countActiveAdmins, getUserById } from '@/lib/queries/users'
import type { ActionResult, ActionData } from './types'

/**
 * USER MANAGEMENT — admin-only actions.
 *
 * Uses the service-role client (lib/supabase/server.ts::createServiceClient)
 * for auth.admin.* operations. Never imported in client components.
 */

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
      entity_type: 'user',
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

// ─── Create user ─────────────────────────────────────────────────────────────

export async function createUser(input: unknown): Promise<ActionData<{
  user_id:       string
  temp_password: string
}>> {
  try {
    await requirePermission('settings', 'write')
    const parsed = newUserSchema.parse(input)

    const ctx = await getCurrentUserContext()
    const admin = createServiceClient()
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any

    // 1. Create the auth.users row
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email:         parsed.email,
      password:      parsed.password,
      email_confirm: true,
      user_metadata: { full_name: parsed.full_name },
    })
    if (createErr || !created?.user) {
      return { success: false, error: createErr?.message ?? 'Failed to create auth user' }
    }
    const newUserId = created.user.id

    // 2. Insert user_profile. Roll back the auth user if this fails.
    const { error: profileErr } = await db.from('user_profiles').insert({
      user_id:    newUserId,
      full_name:  parsed.full_name,
      email:      parsed.email,
      phone:      parsed.phone || null,
      role_id:    parsed.role_id,
      is_active:  true,
      created_by: ctx?.user_id ?? null,
    })
    if (profileErr) {
      // Best-effort rollback — don't leave an orphan auth.users row
      await admin.auth.admin.deleteUser(newUserId).catch(() => undefined)
      return { success: false, error: profileErr.message }
    }

    await logHistory(newUserId, 'created', 'user_created', {
      email:   parsed.email,
      role_id: parsed.role_id,
    })

    revalidatePath('/settings/users')
    revalidatePath('/settings/roles')
    return { success: true, data: { user_id: newUserId, temp_password: parsed.password } }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

// ─── Update profile (name + phone only) ──────────────────────────────────────

export async function updateUser(userId: string, input: unknown): Promise<ActionResult> {
  try {
    await requirePermission('settings', 'write')
    const parsed = updateUserSchema.parse(input)
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any

    const { error } = await db
      .from('user_profiles')
      .update({
        full_name: parsed.full_name,
        phone:     parsed.phone || null,
      })
      .eq('user_id', userId)
    if (error) return { success: false, error: error.message }

    await logHistory(userId, 'edited', 'user_edited', { full_name: parsed.full_name })
    revalidatePath('/settings/users')
    revalidatePath(`/settings/users/${userId}`)
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

// ─── Reset password (admin force-reset) ──────────────────────────────────────

export async function resetPassword(userId: string, input: unknown): Promise<ActionResult> {
  try {
    await requirePermission('settings', 'write')
    const parsed = resetPasswordSchema.parse(input)
    const admin = createServiceClient()

    const { error } = await admin.auth.admin.updateUserById(userId, { password: parsed.password })
    if (error) return { success: false, error: error.message }

    // NEVER log the password — only the event
    await logHistory(userId, 'edited', 'password_reset', {})
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

// ─── Deactivate user ─────────────────────────────────────────────────────────

export async function deactivateUser(userId: string): Promise<ActionResult> {
  try {
    await requirePermission('settings', 'write')
    const ctx = await getCurrentUserContext()
    if (!ctx) return { success: false, error: 'Not authenticated' }

    if (ctx.user_id === userId) {
      return { success: false, error: 'You cannot deactivate your own account.' }
    }

    const target = await getUserById(userId)
    if (!target) return { success: false, error: 'User not found' }

    if (target.role.slug === 'admin') {
      const admins = await countActiveAdmins()
      if (admins <= 1) {
        return { success: false, error: 'Cannot deactivate the last active admin.' }
      }
    }

    const admin = createServiceClient()
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any

    // Ban for ~100 years so the session refresh fails
    const { error: banErr } = await admin.auth.admin.updateUserById(userId, {
      ban_duration: '876000h',
    })
    if (banErr) return { success: false, error: banErr.message }

    const { error } = await db
      .from('user_profiles')
      .update({ is_active: false })
      .eq('user_id', userId)
    if (error) return { success: false, error: error.message }

    await logHistory(userId, 'edited', 'user_deactivated', { email: target.email })
    revalidatePath('/settings/users')
    revalidatePath(`/settings/users/${userId}`)
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function reactivateUser(userId: string): Promise<ActionResult> {
  try {
    await requirePermission('settings', 'write')
    const admin = createServiceClient()
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any

    // 'none' lifts the ban
    const { error: unbanErr } = await admin.auth.admin.updateUserById(userId, {
      ban_duration: 'none',
    })
    if (unbanErr) return { success: false, error: unbanErr.message }

    const { error } = await db
      .from('user_profiles')
      .update({ is_active: true })
      .eq('user_id', userId)
    if (error) return { success: false, error: error.message }

    await logHistory(userId, 'edited', 'user_reactivated', {})
    revalidatePath('/settings/users')
    revalidatePath(`/settings/users/${userId}`)
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

// ─── Change role ─────────────────────────────────────────────────────────────

export async function changeRole(userId: string, input: unknown): Promise<ActionResult> {
  try {
    await requirePermission('settings', 'write')
    const parsed = changeRoleSchema.parse(input)
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any

    const target = await getUserById(userId)
    if (!target) return { success: false, error: 'User not found' }

    // If the target is currently the only active admin and we're moving them off admin → block
    if (target.role.slug === 'admin') {
      const { data: newRoleRow } = await db.from('roles').select('slug').eq('id', parsed.role_id).single()
      if (newRoleRow?.slug !== 'admin') {
        const admins = await countActiveAdmins()
        if (admins <= 1) {
          return { success: false, error: 'Cannot demote the last active admin.' }
        }
      }
    }

    const { error } = await db
      .from('user_profiles')
      .update({ role_id: parsed.role_id })
      .eq('user_id', userId)
    if (error) return { success: false, error: error.message }

    await logHistory(userId, 'edited', 'role_changed', {
      from_role_id: target.role_id,
      to_role_id:   parsed.role_id,
    })
    revalidatePath('/settings/users')
    revalidatePath(`/settings/users/${userId}`)
    revalidatePath('/settings/roles')
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}
