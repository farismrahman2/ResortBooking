import { notFound } from 'next/navigation'
import { Topbar } from '@/components/layout/Topbar'
import { requirePermission } from '@/lib/auth/permissions'
import { getSupplierById } from '@/lib/queries/inventory'
import { SupplierForm } from '@/components/inventory/SupplierForm'

export const dynamic = 'force-dynamic'

export default async function EditSupplierPage({ params }: { params: { id: string } }) {
  await requirePermission('inventory', 'write')
  const supplier = await getSupplierById(params.id)
  if (!supplier) notFound()

  return (
    <div className="flex h-full flex-col">
      <Topbar title="Edit supplier" subtitle={supplier.name} />
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        <div className="mx-auto max-w-2xl">
          <SupplierForm supplier={supplier} />
        </div>
      </div>
    </div>
  )
}
