import { LayoutShell } from '@/components/layout/LayoutShell'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUserContext } from '@/lib/auth/permissions'

export default async function AgentLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const ctx = await getCurrentUserContext()
  return (
    <LayoutShell
      userEmail={user?.email ?? null}
      permissions={ctx?.permissions ?? null}
      roleLabel={ctx?.profile.role.display_name ?? null}
    >
      {children}
    </LayoutShell>
  )
}
