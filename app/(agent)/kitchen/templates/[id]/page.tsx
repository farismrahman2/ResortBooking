import { notFound } from 'next/navigation'
import { Topbar } from '@/components/layout/Topbar'
import { requirePermission } from '@/lib/auth/permissions'
import { listKitchenVendors, listKitchenItems, getTemplateById } from '@/lib/queries/kitchen'
import { TemplateForm } from '@/components/kitchen/TemplateForm'

export const dynamic = 'force-dynamic'

export default async function EditTemplatePage({ params }: { params: { id: string } }) {
  await requirePermission('kitchen', 'write')
  const [template, vendors, items] = await Promise.all([
    getTemplateById(params.id),
    listKitchenVendors(),
    listKitchenItems(),
  ])
  if (!template) notFound()

  return (
    <div className="flex h-full flex-col">
      <Topbar title={template.name} subtitle={`${template.lines.length} items`} />
      <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
        <TemplateForm
          templateId={template.id} initial={template} vendors={vendors} items={items}
        />
      </div>
    </div>
  )
}
