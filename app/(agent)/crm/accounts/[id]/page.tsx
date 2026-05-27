import { notFound } from 'next/navigation'
import Link from 'next/link'
import { GitBranch, Plus } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { requirePermission, hasPermission } from '@/lib/auth/permissions'
import { getAccountById, listContactsByAccount, listChildAccounts, listOpportunities, getActivitiesByAccount } from '@/lib/queries/crm'
import { StatusBadge, TierBadge } from '@/components/crm/StatusBadge'
import { ContactsList } from '@/components/crm/ContactsList'
import { OpportunitiesTable } from '@/components/crm/OpportunitiesTable'
import { AccountActivityPanel } from '@/components/crm/AccountActivityPanel'

export const dynamic = 'force-dynamic'

export default async function AccountDetailPage({ params }: { params: { id: string } }) {
  await requirePermission('crm', 'read')
  const canWrite = await hasPermission('crm', 'write')

  const account = await getAccountById(params.id)
  if (!account) notFound()

  const [contacts, children, opportunities, activities] = await Promise.all([
    listContactsByAccount(account.id),
    listChildAccounts(account.id),
    listOpportunities({ accountId: account.id, ownerView: 'all' }),
    getActivitiesByAccount(account.id),
  ])

  return (
    <div className="flex h-full flex-col">
      <Topbar title={account.company_name} subtitle={account.account_code}
        action={canWrite ? { label: 'Edit', href: `/crm/accounts/${account.id}/edit` } : undefined} />
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        <div className="mx-auto max-w-3xl space-y-5">
          {account.parent && (
            <Link href={`/crm/accounts/${account.parent.id}`}
              className="flex items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-sm text-violet-800 hover:bg-violet-100">
              <GitBranch size={14} /> Branch of <span className="font-medium">{account.parent.company_name}</span> →
            </Link>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={account.status} />
            {account.tier && <TierBadge tier={account.tier.slug} label={account.tier.display_name} />}
            {account.sector && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">{account.sector.display_name}</span>}
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-5 text-sm">
            <Row label="Owner" value={account.owner_name ?? '—'} />
            <Row label="HQ location" value={account.hq_location ?? '—'} />
            <Row label="Branch presence" value={account.branch_presence ?? '—'} />
            <Row label="Approx. employees" value={account.approx_employees != null ? String(account.approx_employees) : '—'} />
            {account.tier && <Row label="Pre-approved discount" value={`${account.tier.default_discount_pct}%`} />}
            {account.next_action && <Row label="Next action" value={account.next_action} />}
            {account.notes && <Row label="Notes" value={account.notes} />}
          </div>

          {/* Contacts */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900">Contacts</h3>
              {canWrite && (
                <Link href={`/crm/accounts/${account.id}/contacts/new`}
                  className="inline-flex items-center gap-1 text-sm font-medium text-amber-700 hover:underline">
                  <Plus size={14} /> Add contact
                </Link>
              )}
            </div>
            <ContactsList contacts={contacts} accountId={account.id} canWrite={canWrite} />
          </div>

          {/* Opportunities */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900">Opportunities</h3>
              {canWrite && (
                <Link href={`/crm/opportunities/new?account=${account.id}`}
                  className="inline-flex items-center gap-1 text-sm font-medium text-amber-700 hover:underline">
                  <Plus size={14} /> New opportunity
                </Link>
              )}
            </div>
            <OpportunitiesTable opportunities={opportunities} />
          </div>

          {/* Activities */}
          <div>
            <h3 className="mb-2 text-sm font-semibold text-gray-900">Activities</h3>
            <AccountActivityPanel
              accountId={account.id} contacts={contacts}
              opportunities={opportunities.map((o) => ({ id: o.id, opportunity_name: o.opportunity_name }))}
              activities={activities} canWrite={canWrite}
            />
          </div>

          {/* Branches */}
          {children.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-semibold text-gray-900">Branches ({children.length})</h3>
              <div className="space-y-2">
                {children.map((c) => (
                  <Link key={c.id} href={`/crm/accounts/${c.id}`}
                    className="block rounded-lg border border-gray-200 bg-white px-4 py-2.5 hover:border-amber-300">
                    <span className="font-medium text-gray-900">{c.company_name}</span>
                    <span className="ml-2 font-mono text-xs text-gray-400">{c.account_code}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {canWrite && (
            <Link href={`/crm/accounts/new?parent=${account.id}`}
              className="inline-flex items-center gap-1 text-sm font-medium text-violet-700 hover:underline">
              <GitBranch size={14} /> Create a branch under this account
            </Link>
          )}

          <Link href="/crm/accounts" className="inline-block text-sm text-amber-700 hover:underline">← Back to accounts</Link>
        </div>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-gray-100 py-2 last:border-0">
      <span className="text-gray-500">{label}</span>
      <span className="max-w-[60%] text-right font-medium text-gray-900">{value}</span>
    </div>
  )
}
