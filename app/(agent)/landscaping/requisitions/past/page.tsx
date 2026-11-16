import { redirect } from 'next/navigation'
import { Topbar } from '@/components/layout/Topbar'
import { LsPage } from '@/components/landscaping/LsNav'
import { PastRequisitionForm } from '@/components/landscaping/PastRequisitionForm'
import { requirePermission } from '@/lib/auth/permissions'
import { getLsMe, listProjects, listSuppliers } from '@/lib/queries/landscaping'

export const dynamic = 'force-dynamic'

/** Admin: enter requisitions already signed on paper, with their bills and payments. */
export default async function PastRequisitionPage() {
  await requirePermission('landscaping', 'write')
  const me = await getLsMe()
  if (!me?.is_admin) redirect('/landscaping/requisitions')
  const [projects, suppliers] = await Promise.all([listProjects(), listSuppliers()])
  return (
    <div className="flex h-full flex-col">
      <Topbar title="Record past requisition" subtitle="Landscaping · bring old paper slips, bills and payments into the system" />
      <LsPage tab="requisitions">
        <PastRequisitionForm projects={projects.map((p) => ({ id: p.id, label: p.label, title: p.title }))} suppliers={suppliers.map((s) => ({ id: s.id, name: s.name }))} />
      </LsPage>
    </div>
  )
}
