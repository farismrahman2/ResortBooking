import { Topbar } from '@/components/layout/Topbar'
import { UserForm } from '@/components/settings/UserForm'
import { listRoles } from '@/lib/queries/roles'
import { requirePermission } from '@/lib/auth/permissions'

export const dynamic = 'force-dynamic'

export default async function NewUserPage() {
  await requirePermission('settings', 'write')
  const roles = await listRoles()

  return (
    <div className="flex h-full flex-col">
      <Topbar title="Add User" subtitle="Create a new system login" />
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        <div className="mx-auto max-w-xl">
          <UserForm roles={roles} />
        </div>
      </div>
    </div>
  )
}
