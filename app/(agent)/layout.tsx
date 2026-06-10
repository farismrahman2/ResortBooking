import { LayoutShell } from '@/components/layout/LayoutShell'
import { getCurrentUserContext } from '@/lib/auth/permissions'
import { getUnreadAlertCount } from '@/lib/auth/alerts'

export default async function AgentLayout({ children }: { children: React.ReactNode }) {
  // ctx already carries the auth user's email — a separate supabase.auth.getUser()
  // here would cost one more network round-trip to Supabase Auth on every page.
  const ctx = await getCurrentUserContext()
  // Only fetch the alert count if user can read settings (admin / their delegates)
  const canSeeAlerts = ctx?.permissions.settings === 'read' || ctx?.permissions.settings === 'write'
  const unreadAlerts = canSeeAlerts ? await getUnreadAlertCount() : 0
  return (
    <LayoutShell
      userEmail={ctx?.email ?? null}
      permissions={ctx?.permissions ?? null}
      roleLabel={ctx?.profile.role.display_name ?? null}
      roleSlug={ctx?.profile.role.slug ?? null}
      unreadAlerts={unreadAlerts}
    >
      {children}
    </LayoutShell>
  )
}
