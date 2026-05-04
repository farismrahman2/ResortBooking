import Link from 'next/link'
import { formatBDT } from '@/lib/formatters/currency'
import { STATUS_BADGE } from './labels'
import type { CoffeeShopSaleRow } from '@/lib/supabase/types-coffee-shop'

interface Props {
  sales: CoffeeShopSaleRow[]
  canWrite: boolean
}

export function TodaysSalesTable({ sales, canWrite: _canWrite }: Props) {
  if (sales.length === 0) {
    return (
      <div className="p-8 text-center">
        <p className="text-sm font-medium text-gray-700">No sales today yet.</p>
        <p className="mt-1 text-xs text-gray-500">Click &quot;New sale&quot; above to record a walk-in transaction.</p>
      </div>
    )
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm min-w-[640px]">
        <thead className="border-b border-gray-200 bg-gray-50">
          <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
            <th className="px-4 py-2 font-medium">Sale #</th>
            <th className="px-4 py-2 font-medium">Customer</th>
            <th className="px-4 py-2 text-right font-medium">Net</th>
            <th className="px-4 py-2 text-right font-medium">Discount</th>
            <th className="px-4 py-2 text-right font-medium">Comp</th>
            <th className="px-4 py-2 font-medium">Status</th>
            <th className="px-4 py-2" />
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {sales.map((s) => (
            <tr key={s.id} className={s.status === 'voided' ? 'opacity-60 line-through' : 'hover:bg-gray-50/60'}>
              <td className="px-4 py-2.5 font-mono text-xs font-semibold text-stone-700">
                <Link href={`/coffee-shop/sales/${s.id}`} className="hover:underline">{s.sale_number}</Link>
              </td>
              <td className="px-4 py-2.5 text-gray-700">{s.customer_label ?? <span className="text-gray-400">—</span>}</td>
              <td className="px-4 py-2.5 text-right font-mono tabular-nums font-semibold">{formatBDT(Number(s.net_amount))}</td>
              <td className="px-4 py-2.5 text-right font-mono tabular-nums text-gray-500">
                {Number(s.discount_amount) > 0 ? `−${formatBDT(Number(s.discount_amount))}` : '—'}
              </td>
              <td className="px-4 py-2.5 text-right font-mono tabular-nums text-gray-500">
                {Number(s.comp_value) > 0 ? formatBDT(Number(s.comp_value)) : '—'}
              </td>
              <td className="px-4 py-2.5">
                <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${STATUS_BADGE[s.status]}`}>
                  {s.status === 'voided' ? 'Voided' : 'Completed'}
                </span>
              </td>
              <td className="px-4 py-2.5 text-right">
                <Link href={`/coffee-shop/sales/${s.id}`} className="text-xs font-medium text-stone-700 hover:underline">View</Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
