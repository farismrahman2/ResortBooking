import Link from 'next/link'
import type { PipelineColumn } from '@/lib/supabase/types-crm'
import { STAGE_LABELS } from '@/lib/crm/stage-probabilities'
import { STAGE_COLUMN_TINT } from './labels'
import { formatBDT } from '@/lib/formatters/currency'

export function PipelineBoard({ columns }: { columns: PipelineColumn[] }) {
  return (
    <div className="flex gap-3 overflow-x-auto pb-3">
      {columns.map((col) => (
        <div key={col.stage} className={`w-64 shrink-0 rounded-xl border border-gray-200 border-t-4 bg-gray-50 ${STAGE_COLUMN_TINT[col.stage]}`}>
          <div className="border-b border-gray-200 px-3 py-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-800">{STAGE_LABELS[col.stage]}</h3>
              <span className="rounded-full bg-white px-1.5 py-0.5 text-xs font-medium text-gray-500">{col.count}</span>
            </div>
            <p className="mt-0.5 text-[11px] text-gray-500">
              {formatBDT(col.total_value)} · wtd {formatBDT(col.weighted_value)}
            </p>
          </div>
          <div className="space-y-2 p-2">
            {col.opportunities.map((o) => (
              <Link key={o.id} href={`/crm/opportunities/${o.id}`}
                className="block rounded-lg border border-gray-200 bg-white p-2.5 text-sm hover:border-amber-300">
                <p className="font-medium text-gray-900">{o.opportunity_name}</p>
                <p className="text-xs text-gray-500">{o.account?.company_name}</p>
                <div className="mt-1 flex items-center justify-between text-[11px] text-gray-500">
                  <span>{formatBDT(o.est_value)}</span>
                  <span>{o.probability_pct}%</span>
                </div>
              </Link>
            ))}
            {col.count === 0 && <p className="px-1 py-3 text-center text-[11px] text-gray-300">—</p>}
          </div>
        </div>
      ))}
    </div>
  )
}
