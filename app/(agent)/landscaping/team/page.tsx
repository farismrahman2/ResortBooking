import { UserPlus } from 'lucide-react'
import Link from 'next/link'
import { LsPage } from '@/components/landscaping/LsNav'
import { TeamClient } from '@/components/landscaping/TeamClient'
import { LinkButton, LsEmpty, LsSection, NextStep } from '@/components/landscaping/ui'
import { requirePermission } from '@/lib/auth/permissions'
import { PeopleList, CategoryList } from '@/components/landscaping/PickListsAdmin'
import { getLsMe, listLsMembers, listPeople, listWorkCategories } from '@/lib/queries/landscaping'

export const dynamic = 'force-dynamic'

export default async function LandscapingTeam() {
  await requirePermission('landscaping', 'read')
  const [me, members, people, categories] = await Promise.all([getLsMe(), listLsMembers(), listPeople(true), listWorkCategories(true)])
  return (
    <LsPage tab="team" title="Team & lists" subtitle="Duties, people and work categories"
      actions={me?.is_admin ? <LinkButton href="/settings/users/new?role=landscaping" variant="primary"><UserPlus size={15} /> <span className="hidden sm:inline">Add landscaping login</span><span className="sm:hidden">Add login</span></LinkButton> : undefined}>
        <NextStep tone="info">
          A <b>Landscaping</b> login sees only this workspace, nothing from the resort: its own menu, requisitions, bills, payments and cash.
          After adding one, tick what that person may do below (prepare, check, approve, pay). Nobody can check or approve a requisition they prepared unless they are an approver.
        </NextStep>
        {members.length === 0
          ? <LsSection title="Who does what"><LsEmpty title="No landscaping users yet." hint="Use “Add landscaping login” above." /></LsSection>
          : <TeamClient members={members} editable={!!me?.is_admin} />}
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
          <PeopleList people={people} editable={!!me?.is_admin} />
          <CategoryList categories={categories} editable={!!me?.is_admin} />
        </div>
    </LsPage>
  )
}
