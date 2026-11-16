import Link from 'next/link'
import { Topbar } from '@/components/layout/Topbar'
import { LsPage } from '@/components/landscaping/LsNav'
import { TeamClient } from '@/components/landscaping/TeamClient'
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
        <p className="rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-600">
          Landscaping logins are made in <Link href="/settings/users/new" className="text-forest-700 underline">Settings → Users</Link> with the role
          <b> Landscaping</b> — they see only this section, nothing from the resort. Nobody can check or approve a requisition they prepared.
        </p>
        {members.length === 0 ? <p className="text-sm text-gray-500">No landscaping users yet.</p> : <TeamClient members={members} editable={!!me?.is_admin} />}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <PeopleList people={people} editable={!!me?.is_admin} />
          <CategoryList categories={categories} editable={!!me?.is_admin} />
        </div>
      </LsPage>
    </div>
  )
}
