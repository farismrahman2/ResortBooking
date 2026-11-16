import { Topbar } from '@/components/layout/Topbar'
import { LsPage } from '@/components/landscaping/LsNav'
import { RequisitionForm } from '@/components/landscaping/RequisitionForm'
import { requirePermission } from '@/lib/auth/permissions'
import { getLsMe, listProjects, nextRequisitionNo } from '@/lib/queries/landscaping'

export const dynamic = 'force-dynamic'

export default async function NewRequisitionPage() {
  await requirePermission('landscaping', 'write')
  const [me, projects, nextNo] = await Promise.all([getLsMe(), listProjects(), nextRequisitionNo()])
  return (
    <div className="flex h-full flex-col">
      <Topbar title="New requisition" subtitle="Landscaping requisition slip" />
      <LsPage tab="requisitions">
        <RequisitionForm projects={projects.filter((p) => p.status !== 'cancelled' && p.status !== 'completed')} nextNo={nextNo} myName={me?.name ?? ''} />
      </LsPage>
    </div>
  )
}
