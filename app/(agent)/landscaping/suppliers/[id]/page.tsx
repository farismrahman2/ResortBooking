import { notFound } from 'next/navigation'
import { Topbar } from '@/components/layout/Topbar'
import { LsPage } from '@/components/landscaping/LsNav'
import { SupplierForm } from '@/components/landscaping/SupplierForm'
import { requirePermission } from '@/lib/auth/permissions'
import { getLsMe, getSupplierLedger } from '@/lib/queries/landscaping'
import { formatBDT } from '@/lib/formatters/currency'

export const dynamic = 'force-dynamic'

export default async function SupplierLedgerPage({ params }: { params: { id: string } }) {
  await requirePermission('landscaping', 'read')
  const [me, data] = await Promise.all([getLsMe(), getSupplierLedger(params.id)])
  if (!data) notFound()
  const { supplier, ledger } = data
  return (
    <div className="flex h-full flex-col">
      <Topbar title={supplier.name} subtitle="Landscaping · supplier ledger" />
      <LsPage tab="suppliers">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[['Opening dues', data.opening], ['Billed', data.billed], ['Paid', data.paid], ['Owed now', data.owed]].map(([l, v]) => (
            <div key={l as string} className="rounded-xl border border-gray-200 bg-white px-4 py-3"><p className="text-xs text-gray-500">{l}</p><p className="text-lg font-semibold tabular-nums">{formatBDT(v as number)}</p></div>
          ))}
        </div>
        <div className="flex justify-end"><SupplierForm supplier={supplier} canSetOpening={!!me && (me.is_admin || me.can_pay)} /></div>
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs text-gray-500"><tr><th className="px-4 py-2">Date</th><th className="px-2 py-2">Entry</th><th className="px-2 py-2 text-right">Bill</th><th className="px-2 py-2 text-right">Paid</th><th className="px-4 py-2 text-right">Balance</th></tr></thead>
            <tbody>
              <tr className="border-t border-gray-100 text-gray-500"><td className="px-4 py-2" colSpan={4}>Opening dues</td><td className="px-4 py-2 text-right tabular-nums">{formatBDT(data.opening)}</td></tr>
              {ledger.map((l, k) => (
                <tr key={k} className="border-t border-gray-100">
                  <td className="px-4 py-2 text-gray-600">{l.date}</td>
                  <td className="px-2 py-2">{l.ref}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{l.debit ? formatBDT(l.debit) : ''}</td>
                  <td className="px-2 py-2 text-right tabular-nums text-emerald-700">{l.credit ? formatBDT(l.credit) : ''}</td>
                  <td className="px-4 py-2 text-right font-medium tabular-nums">{formatBDT(l.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </LsPage>
    </div>
  )
}
