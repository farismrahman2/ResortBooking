import Link from 'next/link'
import { Topbar } from '@/components/layout/Topbar'
import { LsPage } from '@/components/landscaping/LsNav'
import { TeamClient } from '@/components/landscaping/TeamClient'
import { LsEmpty, LsSection, NextStep } from '@/components/landscaping/ui'
import { requirePermission } from '@/lib/auth/permissions'
import { PeopleList, CategoryList } from '@/components/landscaping/PickListsAdmin'
import { getLsMe, listLsMembers, listPeople, listWorkCategories } from '@/lib/queries/landscaping'

export const dynamic = 'force-dynamic'

export default async function LandscapingTeam() {
  await requirePermission('landscaping', 'read')
  const [me, members, people, categories] = await Promise.all([getLsMe(), listLsMembers(), listPeople(true), listWorkCategories(true)])
  return (
    <div className="flex h-full flex-col">
      <Topbar title="Team" subtitle="Landscaping · who prepares, checks, approves and pays · people and categories" />
      <LsPage tab="team">
        <NextStep tone="info">
          Landscaping logins are made in <Link href="/settings/users/new" className="font-medium underline">Settings → Users</Link> with the role
          <b> Landscaping</b> — they see only this section, nothing from the resort. Nobody can check or approve a requisition they prepared.
        </NextStep>
        {members.length === 0
          ? <LsSection title="Who does what"><LsEmpty title="No landscaping users yet." hint="Add a login with the Landscaping role in Settings → Users." /></LsSection>
          : <TeamClient members={members} editable={!!me?.is_admin} />}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <PeopleList people={people} editable={!!me?.is_admin} />
          <CategoryList categories={categories} editable={!!me?.is_admin} />
        </div>
      </LsPage>
    </div>
  )
}
