import { Topbar } from '@/components/layout/Topbar'
import { requirePermission } from '@/lib/auth/permissions'
import { listChangeRequests } from '@/lib/actions/change-requests'
import { ChangeRequestsClient } from '@/components/settings/ChangeRequestsClient'

export const dynamic = 'force-dynamic'

/** Settings → Change requests (admin): money and cancel changes Corporate Sales asked for. */
export default async function ChangeRequestsPage() {
  await requirePermission('settings', 'write')
  const requests = await listChangeRequests()
  return (
    <div className="flex h-full flex-col">
      <Topbar title="Change requests" subtitle="Discounts, payments and cancellations Corporate Sales asked for" />
      <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
        <ChangeRequestsClient requests={requests} />
      </div>
    </div>
  )
}
