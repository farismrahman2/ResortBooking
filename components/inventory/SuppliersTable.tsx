import Link from 'next/link'
import type { InvSupplier } from '@/lib/supabase/types-inventory'

export function SuppliersTable({ suppliers }: { suppliers: InvSupplier[] }) {
  if (suppliers.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-12 text-center">
        <p className="text-sm font-medium text-gray-700">No suppliers yet.</p>
        <p className="mt-1 text-xs text-gray-500">Add one to attribute inventory receipts.</p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="min-w-full text-sm">
        <thead className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
          <tr>
            <th className="px-4 py-2.5 font-medium">Name</th>
            <th className="px-4 py-2.5 font-medium">Phone</th>
            <th className="px-4 py-2.5 font-medium">Email</th>
            <th className="px-4 py-2.5 font-medium">Linked payee</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {suppliers.map((s) => (
            <tr key={s.id} className="hover:bg-gray-50">
              <td className="px-4 py-2.5">
                <Link href={`/inventory/suppliers/${s.id}`} className="font-medium text-gray-900 hover:underline">
                  {s.name}
                </Link>
              </td>
              <td className="px-4 py-2.5 text-gray-600">{s.contact_phone ?? '—'}</td>
              <td className="px-4 py-2.5 text-gray-600">{s.contact_email ?? '—'}</td>
              <td className="px-4 py-2.5 text-gray-500">
                {s.expense_payee_id
                  ? <span className="rounded-full bg-teal-50 px-2 py-0.5 text-xs font-medium text-teal-700">linked</span>
                  : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
