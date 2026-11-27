import { notFound, redirect } from 'next/navigation'
import { LsPage } from '@/components/landscaping/LsNav'
import { RequisitionForm } from '@/components/landscaping/RequisitionForm'
import { requirePermission } from '@/lib/auth/permissions'
import { getLsMe, getRequisition, itemSuggestions, listPeople, listProjects, listWorkCategories } from '@/lib/queries/landscaping'
import { editRule, formatReqNo } from '@/lib/landscaping/money'

export const dynamic = 'force-dynamic'

export default async function EditRequisitionPage({ params }: { params: { id: string } }) {
  await requirePermission('landscaping', 'write')
  const [me, data, projects, people, categories, suggestions] = await Promise.all([getLsMe(), getRequisition(params.id), listProjects(), listPeople(), listWorkCategories(), itemSuggestions()])
  if (!data) notFound()
  const { req, items } = data
  if (!me || !editRule(req.status, req.prepared_by === me.user_id, me.is_admin).ok) redirect(`/landscaping/requisitions/${params.id}`)
  return (
    <LsPage tab="requisitions" title={`Edit ${formatReqNo(req.req_no)}`} back={`/landscaping/requisitions/${req.id}`} narrow>
        {req.status === 'rejected' && req.reject_note && (
          <p className="mx-auto max-w-3xl rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"><b>Sent back:</b> {req.reject_note}</p>
        )}
        <RequisitionForm status={req.status} slipPhotoPath={req.slip_photo_path} slipExtraPaths={req.extra_photo_paths ?? []} canApprove={!!me && (me.can_approve || me.is_admin)} projects={projects} nextNo={req.req_no} myName={me?.name ?? ''} people={people} categories={categories} suggestions={suggestions} initial={{
          id: req.id, req_no: req.req_no, project_id: req.project_id, req_date: req.req_date, department: req.department,
          description: req.description, area_note: req.area_note, remarks: req.remarks, requested_by_name: req.requested_by_name,
          category_id: req.category_id, requested_by_person: req.requested_by_person,
          slip_prepared_by: req.paper_prepared_by, slip_checked_by: req.paper_checked_by, slip_approved_by: req.paper_approved_by,
          items: items.map((i) => ({ description: i.description, qty: i.qty, unit: i.unit, unit_price: i.unit_price })),
        }} />
    </LsPage>
  )
}
