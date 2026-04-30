import { Topbar } from '@/components/layout/Topbar'
import { RoleCard } from '@/components/settings/RoleCard'
import { listRoles, listModules, getRoleHeadcounts } from '@/lib/queries/roles'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/permissions'
import type { PermissionLevel } from '@/lib/supabase/types'

export const dynamic = 'force-dynamic'

export default async function RolesPage() {
  await requirePermission('settings', 'read')

  const [roles, modules, headcounts] = await Promise.all([
    listRoles(),
    listModules(),
    getRoleHeadcounts(),
  ])

  // Pull all permissions in one query and group client-side for the cards
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any
  const { data: allPerms } = await db
    .from('role_permissions')
    .select('role_id, level, module:modules!inner (slug, display_order)')

  const permsByRole = new Map<string, { module: string; level: PermissionLevel; order: number }[]>()
  for (const p of (allPerms ?? []) as { role_id: string; level: PermissionLevel; module: { slug: string; display_order: number } }[]) {
    const list = permsByRole.get(p.role_id) ?? []
    list.push({ module: p.module.slug, level: p.level, order: p.module.display_order })
    permsByRole.set(p.role_id, list)
  }

  return (
    <div className="flex h-full flex-col">
      <Topbar title="Roles & Permissions" subtitle={`${roles.length} system roles · ${modules.length} modules`} />
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 space-y-4">

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700 space-y-1">
          <p>
            <strong>How roles work:</strong> every login is assigned exactly one role. The role&apos;s
            permissions decide which modules they see in the sidebar and what they can do once inside.
          </p>
          <p>
            Levels: <strong>None</strong> = no access · <strong>Read</strong> = view only ·{' '}
            <strong>Write</strong> = view + edit. Roles are predefined and cannot be renamed or deleted —
            you only edit their permissions.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {roles.map((r) => {
            const perms = (permsByRole.get(r.id) ?? [])
              .sort((a, b) => a.order - b.order)
              .map(({ module, level }) => ({ module, level }))
            return (
              <RoleCard
                key={r.id}
                role={r}
                headcount={headcounts[r.id] ?? 0}
                permissionSummary={perms}
              />
            )
          })}
        </div>
      </div>
    </div>
  )
}
