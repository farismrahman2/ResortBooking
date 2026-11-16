import Link from 'next/link'
import { Topbar } from '@/components/layout/Topbar'
import { LsPage } from '@/components/landscaping/LsNav'
import { SupplierForm } from '@/components/landscaping/SupplierForm'
import { requirePermission } from '@/lib/auth/permissions'
import { getLsMe, listSuppliers } from '@/lib/queries/landscaping'
import { formatBDT } from '@/lib/formatters/currency'

export const dynamic = 'force-dynamic'

export default async function SuppliersPage() {
  await requirePermission('landscaping', 'read')
  const [me, suppliers] = await Promise.all([getLsMe(), listSuppliers()])
  const owed = suppliers.reduce((s, x) => s + x.owed, 0)
  return (
    <div className="flex h-full flex-col">
      <Topbar title="Suppliers" subtitle="Landscaping · what each supplier has billed, been paid, and is owed" />
      <LsPage tab="suppliers">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600">Owed to suppliers: <b className="text-gray-900">{formatBDT(owed)}</b></span>
          <div className="ml-auto"><SupplierForm canSetOpening={!!me && (me.is_admin || me.can_pay)} /></div>
        </div>
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          {suppliers.length === 0 ? <p className="px-4 py-6 text-center text-sm text-gray-500">No suppliers yet — they are added with the first bill.</p> : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs text-gray-500"><tr><th className="px-4 py-2">Supplier</th><th className="px-2 py-2 text-right">Billed</th><th className="px-2 py-2 text-right">Paid</th><th className="px-4 py-2 text-right">Owed</th></tr></thead>
              <tbody>
                {suppliers.map((s) => (
                  <tr key={s.id} className="border-t border-gray-100">
                    <td className="px-4 py-2.5"><Link href={`/landscaping/suppliers/${s.id}`} className="font-medium text-forest-700 hover:underline">{s.name}</Link>
                      <div className="text-xs text-gray-500">{s.bills} bill{s.bills === 1 ? '' : 's'}{s.opening ? ` · opening dues ${formatBDT(s.opening)}` : ''}</div></td>
                    <td className="px-2 py-2.5 text-right tabular-nums">{formatBDT(s.billed)}</td>
                    <td className="px-2 py-2.5 text-right tabular-nums">{formatBDT(s.paid)}</td>
                    <td className={`px-4 py-2.5 text-right font-semibold tabular-nums ${s.owed > 0 ? 'text-red-600' : 'text-gray-700'}`}>{formatBDT(s.owed)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </LsPage>
    </div>
  )
}
