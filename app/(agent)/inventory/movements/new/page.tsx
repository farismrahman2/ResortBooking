import { notFound } from 'next/navigation'
import { Topbar } from '@/components/layout/Topbar'
import { requirePermission } from '@/lib/auth/permissions'
import { listStores, listSuppliers, listItems } from '@/lib/queries/inventory'
import { MovementForm } from '@/components/inventory/MovementForm'
import type { MovementType } from '@/lib/supabase/types-inventory'

export const dynamic = 'force-dynamic'

const VALID: MovementType[] = ['receipt', 'issue', 'transfer', 'adjustment']
const LABELS: Record<MovementType, string> = {
  receipt: 'New Receipt', issue: 'New Issue', transfer: 'New Transfer', adjustment: 'New Adjustment',
}

export default async function NewMovementPage({ searchParams }: { searchParams: { type?: string } }) {
  await requirePermission('inventory', 'write')
  const type = searchParams.type as MovementType
  if (!VALID.includes(type)) notFound()

  const [stores, suppliers, items] = await Promise.all([
    listStores(),
    listSuppliers({ active: true }),
    listItems({ activeOnly: true }),
  ])

  return (
    <div className="flex h-full flex-col">
      <Topbar title={LABELS[type]} subtitle="Stock movement" />
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        <div className="mx-auto max-w-3xl">
          <MovementForm type={type} stores={stores} suppliers={suppliers} items={items} />
        </div>
      </div>
    </div>
  )
}
