import { notFound } from 'next/navigation'
import { Topbar } from '@/components/layout/Topbar'
import { requirePermission } from '@/lib/auth/permissions'
import { getOpportunityById, listContactsByAccount } from '@/lib/queries/crm'
import { listUsers } from '@/lib/queries/users'
import { OpportunityForm } from '@/components/crm/OpportunityForm'

export const dynamic = 'force-dynamic'

export default async function EditOpportunityPage({ params }: { params: { id: string } }) {
  await requirePermission('crm', 'write')
  const opp = await getOpportunityById(params.id)
  if (!opp) notFound()

  const [contacts, users] = await Promise.all([listContactsByAccount(opp.account_id), listUsers()])
  const owners = users.map((u) => ({ id: u.user_id, name: u.full_name }))

  return (
    <div className="flex h-full flex-col">
      <Topbar title="Edit opportunity" subtitle={`${opp.opp_code} · ${opp.opportunity_name}`} />
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        <div className="mx-auto max-w-2xl">
          <OpportunityForm accountId={opp.account_id} owners={owners} contacts={contacts} opportunity={opp} />
        </div>
      </div>
    </div>
  )
}
