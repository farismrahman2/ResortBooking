import { LsPage } from '@/components/landscaping/LsNav'
import { RequisitionForm } from '@/components/landscaping/RequisitionForm'
import { requirePermission } from '@/lib/auth/permissions'
import { getLsMe, itemSuggestions, listPeople, listProjects, listWorkCategories, nextRequisitionNo, usedRequisitionNos } from '@/lib/queries/landscaping'

export const dynamic = 'force-dynamic'

export default async function NewRequisitionPage({ searchParams }: { searchParams: { project?: string } }) {
  await requirePermission('landscaping', 'write')
  const [me, projects, nextNo, people, categories, suggestions, usedNos] = await Promise.all([getLsMe(), listProjects(), nextRequisitionNo(), listPeople(), listWorkCategories(), itemSuggestions(), usedRequisitionNos()])
  return (
    <LsPage tab="requisitions" title="New requisition" back="/landscaping/requisitions" narrow>
        <RequisitionForm projects={projects.filter((p) => p.status !== 'cancelled' && p.status !== 'completed')} nextNo={nextNo} myName={me?.name ?? ''} initialProjectId={searchParams.project} usedNos={usedNos} canApprove={!!me && (me.can_approve || me.is_admin)}
          people={people} categories={categories} suggestions={suggestions} />
    </LsPage>
  )
}
