import { LayoutShell } from '@/components/layout/LayoutShell'
import { getCurrentUserContext } from '@/lib/auth/permissions'
import { getUnreadAlertCount } from '@/lib/auth/alerts'
import { getUnseenEnquiryCount } from '@/lib/queries/enquiries'

export default async function AgentLayout({ children }: { children: React.ReactNode }) {
  // ctx already carries the auth user's email — a separate supabase.auth.getUser()
  // here would cost one more network round-trip to Supabase Auth on every page.
  const ctx = await getCurrentUserContext()
  // Only fetch the alert count if user can read settings (admin / their delegates)
  const canSeeAlerts = ctx?.permissions.settings === 'read' || ctx?.permissions.settings === 'write'
  // Only count unseen enquiries if the user can actually see the module.
  const canSeeEnquiries = ctx?.permissions.enquiries === 'read' || ctx?.permissions.enquiries === 'write'
  const [unreadAlerts, unreadEnquiries] = await Promise.all([
    canSeeAlerts ? getUnreadAlertCount() : Promise.resolve(0),
    canSeeEnquiries ? getUnseenEnquiryCount() : Promise.resolve(0),
  ])
  return (
    <LayoutShell
      userEmail={ctx?.email ?? null}
      permissions={ctx?.permissions ?? null}
      roleLabel={ctx?.profile.role.display_name ?? null}
      roleSlug={ctx?.profile.role.slug ?? null}
      unreadAlerts={unreadAlerts}
      unreadEnquiries={unreadEnquiries}
    >
      {children}
    </LayoutShell>
  )
}
