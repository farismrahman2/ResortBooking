import Link from 'next/link'
import { AlertCircle } from 'lucide-react'
import type { InvItemWithStock } from '@/lib/supabase/types-inventory'
import { formatQty } from './labels'

interface Props {
  items:     InvItemWithStock[]
  storeSlug: string
}

export function ItemsTable({ items, storeSlug }: Props) {
  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-12 text-center">
        <p className="text-sm font-medium text-gray-700">No items match.</p>
        <p className="mt-1 text-xs text-gray-500">Add an item or clear the filters.</p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="min-w-full text-sm">
        <thead className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
          <tr>
            <th className="px-4 py-2.5 font-medium">SKU</th>
            <th className="px-4 py-2.5 font-medium">Item</th>
            <th className="px-4 py-2.5 font-medium">Category</th>
            <th className="px-4 py-2.5 font-medium text-right">In stock</th>
            <th className="px-4 py-2.5 font-medium text-right">Reorder</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {items.map((it) => (
            <tr key={it.id} className="hover:bg-gray-50">
              <td className="px-4 py-2.5">
                <Link href={`/inventory/${storeSlug}/items/${it.id}`} className="font-mono text-xs text-teal-700 hover:underline">
                  {it.sku_code}
                </Link>
              </td>
              <td className="px-4 py-2.5">
                <Link href={`/inventory/${storeSlug}/items/${it.id}`} className="font-medium text-gray-900 hover:underline">
                  {it.name}
                </Link>
              </td>
              <td className="px-4 py-2.5 text-gray-600">{it.category?.display_name ?? '—'}</td>
              <td className="px-4 py-2.5 text-right">
                <span className={`tabular-nums font-medium ${it.isBelowReorder ? 'text-red-700' : 'text-gray-900'}`}>
                  {formatQty(it.current_stock, it.unit?.abbreviation)}
                </span>
                {it.isBelowReorder && (
                  <AlertCircle size={13} className="ml-1 inline align-text-bottom text-red-500" />
                )}
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums text-gray-500">
                {it.reorder_point != null ? formatQty(it.reorder_point, it.unit?.abbreviation) : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
