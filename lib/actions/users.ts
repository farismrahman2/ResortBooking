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
    // requirePermission redirects on denial; that throw is Next control flow,
    // not a failure — swallowing it here turned the redirect into a
    // "NEXT_REDIRECT" error toast.
    if (err && typeof err === 'object' && 'digest' in err
      && typeof (err as { digest?: unknown }).digest === 'string'
      && ((err as { digest: string }).digest).startsWith('NEXT_')) throw err
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
    // requirePermission redirects on denial; that throw is Next control flow,
    // not a failure — swallowing it here turned the redirect into a
    // "NEXT_REDIRECT" error toast.
    if (err && typeof err === 'object' && 'digest' in err
      && typeof (err as { digest?: unknown }).digest === 'string'
      && ((err as { digest: string }).digest).startsWith('NEXT_')) throw err
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

// ─── Reset password (admin force-reset) ──────────────────────────────────────

export async function resetPassword(userId: string, input: unknown): Promise<ActionResult> {
  try {
    await requirePermission('settings', 'write')
    const parsed = resetPasswordSchema.parse(input)
    const signOutAll = (input as { signOutAll?: boolean } | null)?.signOutAll !== false   // on unless turned off
    const admin = createServiceClient()

    const { error } = await admin.auth.admin.updateUserById(userId, { password: parsed.password })
    if (error) return { success: false, error: error.message }

    // A stolen laptop that is already signed in keeps working after a
    // password change — end its sessions too (keeping the admin's own).
    let ended = 0
    if (signOutAll) ended = await revokeSessions(userId, null, await currentSessionId())

    // NEVER log the password — only the event
    await logHistory(userId, 'edited', 'password_reset', { signed_out_devices: ended })
    const ctx = await getCurrentUserContext()
    const target = await getUserById(userId)
    const { flagAlert } = await import('@/lib/auth/alerts')
    await flagAlert({
      event_type:  'password_reset',
      entity_type: 'user',
      entity_id:   userId,
      summary:     `Password reset — ${target?.full_name ?? userId}${signOutAll ? ` · signed out of ${ended} device${ended === 1 ? '' : 's'}` : ''}`,
      payload:     { signed_out_devices: ended },
      created_by:  ctx?.user_id ?? null,
    })
    revalidatePath(`/settings/users/${userId}`)
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
    // The ban stops new sign-ins; this ends the ones already open, at once.
    await revokeSessions(userId)

    const { error } = await db
      .from('user_profiles')
      .update({ is_active: false })
      .eq('user_id', userId)
    if (error) return { success: false, error: error.message }

    await logHistory(userId, 'edited', 'user_deactivated', { email: target.email })

    const { flagAlert } = await import('@/lib/auth/alerts')
    await flagAlert({
      event_type:  'user_deactivated',
      entity_type: 'user',
      entity_id:   userId,
      summary:     `User deactivated — ${target.full_name} (${target.email}, role: ${target.role.display_name})`,
      payload:     { email: target.email, role_slug: target.role.slug },
      created_by:  ctx.user_id,
    })

    revalidatePath('/settings/users')
    revalidatePath(`/settings/users/${userId}`)
    revalidatePath('/settings/audit-log')
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
    // requirePermission redirects on denial; that throw is Next control flow,
    // not a failure — swallowing it here turned the redirect into a
    // "NEXT_REDIRECT" error toast.
    if (err && typeof err === 'object' && 'digest' in err
      && typeof (err as { digest?: unknown }).digest === 'string'
      && ((err as { digest: string }).digest).startsWith('NEXT_')) throw err
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
    // requirePermission redirects on denial; that throw is Next control flow,
    // not a failure — swallowing it here turned the redirect into a
    // "NEXT_REDIRECT" error toast.
    if (err && typeof err === 'object' && 'digest' in err
      && typeof (err as { digest?: unknown }).digest === 'string'
      && ((err as { digest: string }).digest).startsWith('NEXT_')) throw err
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}


// ─── Signed-in devices (lost or stolen laptops) ─────────────────────────────

/** The caller's own session id, from their access token — so signing others
 *  out never signs the admin out of the device they're using. */
async function currentSessionId(): Promise<string | null> {
  try {
    const { data } = await createClient().auth.getSession()
    const token = data.session?.access_token
    if (!token) return null
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'))
    return typeof payload.session_id === 'string' ? payload.session_id : null
  } catch {
    return null
  }
}

/** End one or all of a user's sessions (migrations/security/001). Returns how many. */
async function revokeSessions(userId: string, sessionId: string | null = null, keepSessionId: string | null = null): Promise<number> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (createServiceClient() as any).rpc('admin_revoke_sessions', {
    p_user: userId, p_session: sessionId, p_keep_session: keepSessionId,
  })
  if (error) throw new Error(`Could not sign out: ${error.message}`)
  return Number(data ?? 0)
}

export interface UserSession {
  id: string; created_at: string; last_active: string; device: string; ip: string | null; current: boolean
}

/** Devices this user is signed in on (admin only). */
export async function listUserSessions(userId: string): Promise<ActionData<UserSession[]>> {
  try {
    await requirePermission('settings', 'write')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (createServiceClient() as any).rpc('admin_list_sessions', { p_user: userId })
    if (error) return { success: false, error: error.message }
    const mine = await currentSessionId()
    const { describeUserAgent } = await import('@/lib/auth/user-agent')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { success: true, data: ((data ?? []) as any[]).map((r) => ({
      id: r.id, created_at: r.created_at, last_active: r.last_active, device: describeUserAgent(r.user_agent),
      ip: r.ip ?? null, current: r.id === mine,
    })) }
  } catch (err) {
    if (isNextControlFlow(err)) throw err
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/** Sign a user out of one device, or of all of them (never the admin's own). */
export async function signOutUser(userId: string, sessionId?: string): Promise<ActionData<{ ended: number }>> {
  try {
    await requirePermission('settings', 'write')
    const ctx = await getCurrentUserContext()
    const ended = await revokeSessions(userId, sessionId ?? null, await currentSessionId())
    const target = await getUserById(userId)
    await logHistory(userId, 'edited', 'sessions_revoked', { ended, one_device: !!sessionId })
    const { flagAlert } = await import('@/lib/auth/alerts')
    await flagAlert({
      event_type:  'sessions_revoked',
      entity_type: 'user',
      entity_id:   userId,
      summary:     `Signed out — ${target?.full_name ?? userId}: ${sessionId ? 'one device' : `all devices (${ended})`}`,
      payload:     { ended, session_id: sessionId ?? null },
      created_by:  ctx?.user_id ?? null,
    })
    revalidatePath(`/settings/users/${userId}`)
    return { success: true, data: { ended } }
  } catch (err) {
    if (isNextControlFlow(err)) throw err
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/** Emergency: sign out every user on every device except this one. */
export async function signOutEveryone(confirmText: string): Promise<ActionData<{ ended: number }>> {
  try {
    await requirePermission('settings', 'write')
    if (confirmText.trim().toUpperCase() !== 'SIGN OUT') return { success: false, error: 'Type SIGN OUT to confirm.' }
    const keep = await currentSessionId()
    if (!keep) return { success: false, error: 'Could not identify your own session — sign in again and retry.' }
    const ctx = await getCurrentUserContext()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (createServiceClient() as any).rpc('admin_revoke_all_sessions', { p_keep_session: keep })
    if (error) return { success: false, error: error.message }
    const ended = Number(data ?? 0)
    const { flagAlert } = await import('@/lib/auth/alerts')
    await flagAlert({
      event_type:  'sessions_revoked',
      entity_type: 'user',
      entity_id:   ctx?.user_id ?? 'all',
      summary:     `Emergency sign-out — every user signed out (${ended} session${ended === 1 ? '' : 's'} ended)`,
      payload:     { ended, everyone: true },
      created_by:  ctx?.user_id ?? null,
    })
    revalidatePath('/settings/users')
    return { success: true, data: { ended } }
  } catch (err) {
    if (isNextControlFlow(err)) throw err
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

function isNextControlFlow(err: unknown): boolean {
  return !!err && typeof err === 'object' && 'digest' in err
    && typeof (err as { digest?: unknown }).digest === 'string'
    && (err as { digest: string }).digest.startsWith('NEXT_')
}
