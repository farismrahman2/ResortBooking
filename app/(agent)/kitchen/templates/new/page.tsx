import { Topbar } from '@/components/layout/Topbar'
import { requirePermission } from '@/lib/auth/permissions'
import { listKitchenVendors, listKitchenItems } from '@/lib/queries/kitchen'
import { TemplateForm } from '@/components/kitchen/TemplateForm'

export const dynamic = 'force-dynamic'

export default async function NewTemplatePage() {
  await requirePermission('kitchen', 'write')
  const [vendors, items] = await Promise.all([listKitchenVendors(), listKitchenItems()])
  return (
    <div className="flex h-full flex-col">
      <Topbar title="New template" subtitle="A standing list to order from" />
      <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
        <TemplateForm initial={null} vendors={vendors} items={items} />
      </div>
    </div>
  )
}
