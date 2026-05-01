import { LayoutShell } from '@/components/layout/LayoutShell'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUserContext } from '@/lib/auth/permissions'
import { getUnreadAlertCount } from '@/lib/auth/alerts'

export default async function AgentLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const ctx = await getCurrentUserContext()
  // Only fetch the alert count if user can read settings (admin / their delegates)
  const canSeeAlerts = ctx?.permissions.settings === 'read' || ctx?.permissions.settings === 'write'
  const unreadAlerts = canSeeAlerts ? await getUnreadAlertCount() : 0
  return (
    <LayoutShell
      userEmail={user?.email ?? null}
      permissions={ctx?.permissions ?? null}
      roleLabel={ctx?.profile.role.display_name ?? null}
      unreadAlerts={unreadAlerts}
    >
      {children}
    </LayoutShell>
  )
}
