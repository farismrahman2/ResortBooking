import { Topbar } from '@/components/layout/Topbar'
import { requirePermission, getCurrentUserContext } from '@/lib/auth/permissions'
import { listSectors, listTiers, listAccounts } from '@/lib/queries/crm'
import { listUsers } from '@/lib/queries/users'
import { AccountForm } from '@/components/crm/AccountForm'

export const dynamic = 'force-dynamic'

export default async function NewAccountPage({ searchParams }: { searchParams: { parent?: string } }) {
  await requirePermission('crm', 'write')
  const ctx = await getCurrentUserContext()

  const [sectors, tiers, users, accounts] = await Promise.all([
    listSectors(), listTiers(), listUsers(), listAccounts({ ownerView: 'all' }),
  ])
  const owners = users.map((u) => ({ id: u.user_id, name: u.full_name }))
  const parentChoices = accounts.map((a) => ({ id: a.id, company_name: a.company_name }))

  return (
    <div className="flex h-full flex-col">
      <Topbar title="New account" subtitle="Corporate B2B account" />
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        <div className="mx-auto max-w-2xl">
          <AccountForm
            sectors={sectors} tiers={tiers} owners={owners} parentChoices={parentChoices}
            defaultOwnerId={ctx?.user_id} fixedParentId={searchParams.parent}
          />
        </div>
      </div>
    </div>
  )
}
