import { notFound, redirect } from 'next/navigation'
import { Topbar } from '@/components/layout/Topbar'
import { LsPage } from '@/components/landscaping/LsNav'
import { RequisitionForm } from '@/components/landscaping/RequisitionForm'
import { requirePermission } from '@/lib/auth/permissions'
import { getLsMe, getRequisition, itemSuggestions, listPeople, listProjects, listWorkCategories } from '@/lib/queries/landscaping'
import { formatReqNo } from '@/lib/landscaping/money'

export const dynamic = 'force-dynamic'

export default async function EditRequisitionPage({ params }: { params: { id: string } }) {
  await requirePermission('landscaping', 'write')
  const [me, data, projects, people, categories, suggestions] = await Promise.all([getLsMe(), getRequisition(params.id), listProjects(), listPeople(), listWorkCategories(), itemSuggestions()])
  if (!data) notFound()
  const { req, items } = data
  if (!['draft', 'rejected'].includes(req.status) || (req.prepared_by !== me?.user_id && !me?.is_admin)) redirect(`/landscaping/requisitions/${params.id}`)
  return (
    <div className="flex h-full flex-col">
      <Topbar title={`Edit requisition ${formatReqNo(req.req_no)}`} subtitle="Landscaping" />
      <LsPage tab="requisitions">
        <RequisitionForm projects={projects} nextNo={req.req_no} myName={me?.name ?? ''} people={people} categories={categories} suggestions={suggestions} initial={{
          id: req.id, req_no: req.req_no, project_id: req.project_id, req_date: req.req_date, department: req.department,
          description: req.description, area_note: req.area_note, remarks: req.remarks, requested_by_name: req.requested_by_name,
          category_id: req.category_id, requested_by_person: req.requested_by_person,
          items: items.map((i) => ({ description: i.description, qty: i.qty, unit: i.unit, unit_price: i.unit_price })),
        }} />
      </LsPage>
    </div>
  )
}
