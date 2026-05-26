import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Topbar } from '@/components/layout/Topbar'
import { requirePermission, hasPermission } from '@/lib/auth/permissions'
import { getSupplierById } from '@/lib/queries/inventory'

export const dynamic = 'force-dynamic'

export default async function SupplierDetailPage({ params }: { params: { id: string } }) {
  await requirePermission('inventory', 'read')
  const canWrite = await hasPermission('inventory', 'write')

  const supplier = await getSupplierById(params.id)
  if (!supplier) notFound()

  return (
    <div className="flex h-full flex-col">
      <Topbar
        title={supplier.name}
        subtitle="Supplier"
        action={canWrite ? { label: 'Edit', href: `/inventory/suppliers/${supplier.id}/edit` } : undefined}
      />
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        <div className="mx-auto max-w-2xl space-y-4">
          <div className="rounded-xl border border-gray-200 bg-white p-5 text-sm">
            <Row label="Phone"   value={supplier.contact_phone ?? '—'} />
            <Row label="Email"   value={supplier.contact_email ?? '—'} />
            <Row label="Address" value={supplier.contact_address ?? '—'} />
            <Row label="Linked payee" value={supplier.expense_payee_id ? 'Yes' : 'No'} />
            {supplier.notes && <Row label="Notes" value={supplier.notes} />}
          </div>
          <Link href="/inventory/suppliers" className="text-sm text-teal-700 hover:underline">← Back to suppliers</Link>
        </div>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-gray-100 py-2 last:border-0">
      <span className="text-gray-500">{label}</span>
      <span className="text-right font-medium text-gray-900">{value}</span>
    </div>
  )
}
