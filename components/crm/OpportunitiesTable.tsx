import Link from 'next/link'
import type { CrmOpportunityWithRelations } from '@/lib/supabase/types-crm'
import { STAGE_LABELS } from '@/lib/crm/stage-probabilities'
import { formatBDT } from '@/lib/formatters/currency'

export function OpportunitiesTable({ opportunities }: { opportunities: CrmOpportunityWithRelations[] }) {
  if (opportunities.length === 0) {
    return <div className="rounded-xl border border-gray-200 bg-white p-12 text-center text-sm text-gray-500">No opportunities yet.</div>
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="min-w-full text-sm">
        <thead className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
          <tr>
            <th className="px-4 py-2.5 font-medium">Opportunity</th>
            <th className="px-4 py-2.5 font-medium">Account</th>
            <th className="px-4 py-2.5 font-medium">Stage</th>
            <th className="px-4 py-2.5 font-medium text-right">Est. value</th>
            <th className="px-4 py-2.5 font-medium text-right">Prob.</th>
            <th className="px-4 py-2.5 font-medium">Event date</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {opportunities.map((o) => (
            <tr key={o.id} className="hover:bg-gray-50">
              <td className="px-4 py-2.5">
                <Link href={`/crm/opportunities/${o.id}`} className="font-medium text-gray-900 hover:underline">{o.opportunity_name}</Link>
                <div className="font-mono text-xs text-gray-400">{o.opp_code}</div>
              </td>
              <td className="px-4 py-2.5 text-gray-600">{o.account?.company_name ?? '—'}</td>
              <td className="px-4 py-2.5 text-gray-600">{STAGE_LABELS[o.stage]}</td>
              <td className="px-4 py-2.5 text-right tabular-nums">{formatBDT(o.est_value)}</td>
              <td className="px-4 py-2.5 text-right tabular-nums text-gray-500">{o.probability_pct}%</td>
              <td className="px-4 py-2.5 text-gray-600">{o.expected_event_date ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
