import Link from 'next/link'
import type { FaAssetWithRelations } from '@/lib/supabase/types-fixed-assets'
import { ConditionBadge, StatusBadge } from './Badges'
import { formatBDT } from '@/lib/formatters/currency'

export function AssetsTable({ assets }: { assets: FaAssetWithRelations[] }) {
  if (assets.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-12 text-center">
        <p className="text-sm font-medium text-gray-700">No assets match.</p>
        <p className="mt-1 text-xs text-gray-500">Add an asset or clear the filters.</p>
      </div>
    )
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="min-w-full text-sm">
        <thead className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
          <tr>
            <th className="px-4 py-2.5 font-medium">Tag / Name</th>
            <th className="px-4 py-2.5 font-medium">Category</th>
            <th className="px-4 py-2.5 font-medium">Location</th>
            <th className="px-4 py-2.5 font-medium text-right">Cost</th>
            <th className="px-4 py-2.5 font-medium text-right">Net book value</th>
            <th className="px-4 py-2.5 font-medium">Condition</th>
            <th className="px-4 py-2.5 font-medium">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {assets.map((a) => (
            <tr key={a.id} className="hover:bg-gray-50">
              <td className="px-4 py-2.5">
                <Link href={`/fixed-assets/assets/${a.id}`} className="font-medium text-gray-900 hover:underline">{a.name}</Link>
                <div className="font-mono text-xs text-gray-400">{a.asset_tag}</div>
              </td>
              <td className="px-4 py-2.5 text-gray-600">{a.category?.display_name ?? '—'}</td>
              <td className="px-4 py-2.5 text-gray-600">{a.location?.display_name ?? '—'}</td>
              <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">{formatBDT(a.acquisition_cost)}</td>
              <td className="px-4 py-2.5 text-right tabular-nums font-medium text-gray-900">{formatBDT(a.depreciation.netBookValue)}</td>
              <td className="px-4 py-2.5"><ConditionBadge condition={a.condition} /></td>
              <td className="px-4 py-2.5"><StatusBadge status={a.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
