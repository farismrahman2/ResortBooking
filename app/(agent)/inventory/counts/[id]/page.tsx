import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Topbar } from '@/components/layout/Topbar'
import { requirePermission } from '@/lib/auth/permissions'
import { getCountById } from '@/lib/queries/inventory'
import { CountSheet } from '@/components/inventory/CountSheet'

export const dynamic = 'force-dynamic'

export default async function CountDetailPage({ params }: { params: { id: string } }) {
  await requirePermission('inventory', 'read')
  const count = await getCountById(params.id)
  if (!count) notFound()

  return (
    <div className="flex h-full flex-col">
      <Topbar title={count.count_number} subtitle={`${count.store?.display_name ?? ''} · ${count.status.replace('_', ' ')}`} />
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        <div className="mx-auto max-w-3xl space-y-4">
          {count.status === 'finalized' && count.adjustment_movement_id && (
            <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              Finalized — a recount adjustment was generated.{' '}
              <Link href={`/inventory/movements/${count.adjustment_movement_id}`} className="font-medium underline">View it</Link>
            </div>
          )}
          <CountSheet count={count} />
          <Link href="/inventory/counts" className="inline-block text-sm text-teal-700 hover:underline">← Back to counts</Link>
        </div>
      </div>
    </div>
  )
}
