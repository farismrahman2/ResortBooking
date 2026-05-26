import type { FaAsset, DepreciationResult } from '@/lib/supabase/types-fixed-assets'
import { formatBDT } from '@/lib/formatters/currency'

export function AssetDepreciationCard({ asset, dep }: { asset: FaAsset; dep: DepreciationResult }) {
  const totalMonths = asset.useful_life_years * 12
  const pct = totalMonths > 0 ? Math.min(100, Math.round((dep.monthsElapsed / totalMonths) * 100)) : 0
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Monthly depreciation" value={formatBDT(dep.monthlyDepreciation)} />
        <Kpi label="Accumulated" value={formatBDT(dep.totalDepreciation)} />
        <Kpi label="Net book value" value={formatBDT(dep.netBookValue)} emphasis />
        <Kpi label="Remaining" value={`${dep.remainingUsefulMonths} mo`} />
      </div>
      <div>
        <div className="mb-1 flex justify-between text-xs text-gray-500">
          <span>Acquisition {formatBDT(asset.acquisition_cost)}</span>
          <span>Salvage {formatBDT(asset.salvage_value)}</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
          <div className="h-full bg-zinc-500" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-1 text-xs text-gray-500">
          {dep.isFullyDepreciated ? 'Fully depreciated' : `${dep.monthsElapsed} of ${totalMonths} months elapsed (${pct}%)`}
        </p>
      </div>
    </div>
  )
}

function Kpi({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      <p className={`mt-0.5 text-base font-bold tabular-nums ${emphasis ? 'text-zinc-800' : 'text-gray-900'}`}>{value}</p>
    </div>
  )
}
