import Link from 'next/link'
import { Topbar } from '@/components/layout/Topbar'
import { requirePermission, getCurrentUserContext } from '@/lib/auth/permissions'
import { getAccountById, listContactsByAccount, listAccounts } from '@/lib/queries/crm'
import { listUsers } from '@/lib/queries/users'
import { OpportunityForm } from '@/components/crm/OpportunityForm'

export const dynamic = 'force-dynamic'

export default async function NewOpportunityPage({ searchParams }: { searchParams: { account?: string } }) {
  await requirePermission('crm', 'write')
  const ctx = await getCurrentUserContext()

  // Step 1 — no account chosen yet: show an account picker.
  if (!searchParams.account) {
    const accounts = await listAccounts({ ownerView: 'mine' })
    return (
      <div className="flex h-full flex-col">
        <Topbar title="New opportunity" subtitle="Pick the account this deal belongs to" />
        <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
          <div className="mx-auto max-w-2xl space-y-2">
            {accounts.length === 0 && <p className="text-sm text-gray-500">No accounts yet. Create an account first.</p>}
            {accounts.map((a) => (
              <Link key={a.id} href={`/crm/opportunities/new?account=${a.id}`}
                className="block rounded-lg border border-gray-200 bg-white px-4 py-2.5 hover:border-amber-300">
                <span className="font-medium text-gray-900">{a.company_name}</span>
                <span className="ml-2 font-mono text-xs text-gray-400">{a.account_code}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // Step 2 — account chosen: render the form.
  const account = await getAccountById(searchParams.account)
  if (!account) {
    return (
      <div className="p-6 text-sm text-red-600">Account not found. <Link href="/crm/opportunities/new" className="underline">Pick another</Link>.</div>
    )
  }
  const [contacts, users] = await Promise.all([listContactsByAccount(account.id), listUsers()])
  const owners = users.map((u) => ({ id: u.user_id, name: u.full_name }))

  return (
    <div className="flex h-full flex-col">
      <Topbar title="New opportunity" subtitle={account.company_name} />
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        <div className="mx-auto max-w-2xl">
          <OpportunityForm accountId={account.id} owners={owners} contacts={contacts} defaultOwnerId={ctx?.user_id} />
        </div>
      </div>
    </div>
  )
}
