import { getCurrentUserContext } from '@/lib/auth/permissions'

/**
 * Per-record visibility for CRM. Elevated roles see everything; corporate_sales
 * sees their own records by default but can flip to 'all'. Enforced in the
 * query layer (cheap row-level approach — not Postgres RLS).
 */
const ELEVATED_ROLES = ['admin', 'md', 'manager', 'operations_manager']

export interface CrmVisibility {
  userId:   string
  elevated: boolean
  roleSlug: string
}

export async function getCrmVisibility(): Promise<CrmVisibility | null> {
  const ctx = await getCurrentUserContext()
  if (!ctx) return null
  return {
    userId:   ctx.user_id,
    elevated: ELEVATED_ROLES.includes(ctx.profile.role.slug),
    roleSlug: ctx.profile.role.slug,
  }
}

/**
 * Returns the owner_user_id to filter by, or null for "no filter".
 * - elevated roles: always null (see all)
 * - corporate_sales with view='all': null
 * - corporate_sales with view='mine' (default): their own id
 */
export function ownerFilterId(vis: CrmVisibility, view: 'mine' | 'all'): string | null {
  if (vis.elevated) return null
  if (view === 'all') return null
  return vis.userId
}
