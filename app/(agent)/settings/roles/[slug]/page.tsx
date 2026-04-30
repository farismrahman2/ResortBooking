import { notFound } from 'next/navigation'
import { Topbar } from '@/components/layout/Topbar'
import { PermissionGrid } from '@/components/settings/PermissionGrid'
import { getRoleWithPermissions, listModules } from '@/lib/queries/roles'
import { requirePermission } from '@/lib/auth/permissions'
import type { RoleSlug } from '@/lib/supabase/types'

export const dynamic = 'force-dynamic'

const VALID: RoleSlug[] = ['admin', 'manager', 'front_desk', 'accountant']

interface PageProps {
  params: { slug: string }
}

export default async function RoleEditorPage({ params }: PageProps) {
  await requirePermission('settings', 'read')

  if (!VALID.includes(params.slug as RoleSlug)) notFound()

  const slug = params.slug as RoleSlug
  const [role, modules] = await Promise.all([
    getRoleWithPermissions(slug),
    listModules(),
  ])
  if (!role) notFound()

  return (
    <div className="flex h-full flex-col">
      <Topbar title={role.display_name} subtitle={role.description ?? 'Edit module permissions'} />
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        <div className="mx-auto max-w-3xl">
          <PermissionGrid
            role={role}
            modules={modules}
            initial={role.permissions}
          />
        </div>
      </div>
    </div>
  )
}
