import { notFound } from 'next/navigation'
import { Topbar } from '@/components/layout/Topbar'
import { requirePermission } from '@/lib/auth/permissions'
import { getAccountById, listSectors, listTiers, listAccounts } from '@/lib/queries/crm'
import { listUsers } from '@/lib/queries/users'
import { AccountForm } from '@/components/crm/AccountForm'

export const dynamic = 'force-dynamic'

export default async function EditAccountPage({ params }: { params: { id: string } }) {
  await requirePermission('crm', 'write')
  const account = await getAccountById(params.id)
  if (!account) notFound()

  const [sectors, tiers, users, accounts] = await Promise.all([
    listSectors(), listTiers(), listUsers(), listAccounts({ ownerView: 'all' }),
  ])
  const owners = users.map((u) => ({ id: u.user_id, name: u.full_name }))
  const parentChoices = accounts.filter((a) => a.id !== account.id).map((a) => ({ id: a.id, company_name: a.company_name }))

  return (
    <div className="flex h-full flex-col">
      <Topbar title="Edit account" subtitle={`${account.account_code} · ${account.company_name}`} />
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        <div className="mx-auto max-w-2xl">
          <AccountForm sectors={sectors} tiers={tiers} owners={owners} parentChoices={parentChoices} account={account} />
        </div>
      </div>
    </div>
  )
}
