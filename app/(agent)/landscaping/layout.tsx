import { LsShell } from '@/components/landscaping/LsShell'
import { getCurrentUserContext } from '@/lib/auth/permissions'
import { getLsMe } from '@/lib/queries/landscaping'

/** The Landscaping workspace: its own navigation, separate from the resort. */
export default async function LandscapingLayout({ children }: { children: React.ReactNode }) {
  const [ctx, me] = await Promise.all([getCurrentUserContext(), getLsMe()])
  const onlyLandscaping = ctx?.profile.role.slug === 'landscaping'
  const manager = !!me && (me.is_admin || me.can_approve)
  return (
    <LsShell manager={manager} onlyLandscaping={onlyLandscaping}
      userName={ctx?.profile.full_name ?? ctx?.email ?? ''} roleLabel={ctx?.profile.role.display_name ?? ''}>
      {children}
    </LsShell>
  )
}
