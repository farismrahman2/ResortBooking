import Link from 'next/link'
import { Plus } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { Button } from '@/components/ui/Button'
import { UsersTable } from '@/components/settings/UsersTable'
import { listUsers } from '@/lib/queries/users'
import { requirePermission, getCurrentUserContext } from '@/lib/auth/permissions'
import { UsersFilterBar } from './UsersClient'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: { showInactive?: string }
}

export default async function UsersPage({ searchParams }: PageProps) {
  await requirePermission('settings', 'read')

  const showInactive = searchParams.showInactive === '1'
  const [rows, ctx] = await Promise.all([
    listUsers({ includeInactive: showInactive }),
    getCurrentUserContext(),
  ])

  return (
    <div className="flex h-full flex-col">
      <Topbar title="Users" subtitle="System logins" />
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-gray-500">
            <span className="font-medium text-gray-700">{rows.length}</span> user{rows.length === 1 ? '' : 's'} shown
          </p>
          <Link href="/settings/users/new">
            <Button variant="primary" size="md" className="gap-1.5">
              <Plus size={14} />
              Add User
            </Button>
          </Link>
        </div>

        <UsersFilterBar showInactive={showInactive} />

        <UsersTable rows={rows} currentUserId={ctx?.user_id ?? null} />
      </div>
    </div>
  )
}
