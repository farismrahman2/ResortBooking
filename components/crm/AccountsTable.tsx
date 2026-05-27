import Link from 'next/link'
import { GitBranch } from 'lucide-react'
import type { CrmAccountWithRelations } from '@/lib/supabase/types-crm'
import { StatusBadge, TierBadge } from './StatusBadge'
import { formatBdPhone } from '@/lib/crm/phone-format'

export function AccountsTable({ accounts }: { accounts: CrmAccountWithRelations[] }) {
  if (accounts.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-12 text-center">
        <p className="text-sm font-medium text-gray-700">No accounts match.</p>
        <p className="mt-1 text-xs text-gray-500">Add an account or change the filters / view.</p>
      </div>
    )
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="min-w-full text-sm">
        <thead className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
          <tr>
            <th className="px-4 py-2.5 font-medium">Company</th>
            <th className="px-4 py-2.5 font-medium">Sector</th>
            <th className="px-4 py-2.5 font-medium">Tier</th>
            <th className="px-4 py-2.5 font-medium">Status</th>
            <th className="px-4 py-2.5 font-medium">Primary contact</th>
            <th className="px-4 py-2.5 font-medium">Owner</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {accounts.map((a) => (
            <tr key={a.id} className="hover:bg-gray-50">
              <td className="px-4 py-2.5">
                <Link href={`/crm/accounts/${a.id}`} className="font-medium text-gray-900 hover:underline">{a.company_name}</Link>
                <div className="flex items-center gap-1.5 text-xs text-gray-400">
                  <span className="font-mono">{a.account_code}</span>
                  {a.parent && <span className="inline-flex items-center gap-0.5 text-violet-600"><GitBranch size={11} /> branch</span>}
                  {a.children_count > 0 && <span className="text-violet-600">· {a.children_count} branches</span>}
                </div>
              </td>
              <td className="px-4 py-2.5 text-gray-600">{a.sector?.display_name ?? '—'}</td>
              <td className="px-4 py-2.5">{a.tier ? <TierBadge tier={a.tier.slug} /> : '—'}</td>
              <td className="px-4 py-2.5"><StatusBadge status={a.status} /></td>
              <td className="px-4 py-2.5 text-gray-600">
                {a.primary_contact
                  ? <div><div className="text-gray-900">{a.primary_contact.full_name}</div><div className="text-xs text-gray-400">{formatBdPhone(a.primary_contact.phone)}</div></div>
                  : '—'}
              </td>
              <td className="px-4 py-2.5 text-gray-600">{a.owner_name ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
