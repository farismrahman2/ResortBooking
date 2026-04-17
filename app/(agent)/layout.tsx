import { LayoutShell } from '@/components/layout/LayoutShell'
import { createClient } from '@/lib/supabase/server'

export default async function AgentLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return <LayoutShell userEmail={user?.email ?? null}>{children}</LayoutShell>
}
