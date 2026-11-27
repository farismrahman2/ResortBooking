import { redirect } from 'next/navigation'
import { LsPage } from '@/components/landscaping/LsNav'
import { PastRequisitionForm } from '@/components/landscaping/PastRequisitionForm'
import { requirePermission } from '@/lib/auth/permissions'
import { getLsMe, itemSuggestions, listPeople, listProjects, listSuppliers, listWorkCategories } from '@/lib/queries/landscaping'

export const dynamic = 'force-dynamic'

/** Admin: enter requisitions already signed on paper, with their bills and payments. */
export default async function PastRequisitionPage() {
  await requirePermission('landscaping', 'write')
  const me = await getLsMe()
  if (!me?.is_admin) redirect('/landscaping/requisitions')
  const [projects, suppliers, people, categories, suggestions] = await Promise.all([listProjects(), listSuppliers(), listPeople(), listWorkCategories(), itemSuggestions()])
  return (
    <LsPage tab="requisitions" title="Record past slip" subtitle="Already approved on paper" back="/landscaping/requisitions" narrow>
        <PastRequisitionForm projects={projects.map((p) => ({ id: p.id, label: p.label, title: p.title }))} suppliers={suppliers.map((s) => ({ id: s.id, name: s.name }))}
          people={people} categories={categories} suggestions={suggestions} />
    </LsPage>
  )
}
