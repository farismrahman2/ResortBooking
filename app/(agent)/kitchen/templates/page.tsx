import Link from 'next/link'
import { ChevronRight, Plus, LayoutTemplate } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { requirePermission, hasPermission } from '@/lib/auth/permissions'
import { listTemplates } from '@/lib/queries/kitchen'
import { KitchenNav } from '@/components/kitchen/KitchenNav'
import { EmptyState } from '@/components/ui/EmptyState'
import { MigrationErrorBanner } from '@/components/ui/MigrationErrorBanner'

export const dynamic = 'force-dynamic'

export default async function TemplatesPage() {
  await requirePermission('kitchen', 'read')
  const canWrite = await hasPermission('kitchen', 'write')

  try {
    // Hidden ones are shown here — this is where you'd go to bring one back.
    const templates = await listTemplates(true)
    return (
      <div className="flex h-full flex-col">
        <Topbar
          title="Order templates"
          subtitle="The standing lists you order from"
          action={canWrite ? { label: 'New template', href: '/kitchen/templates/new' } : undefined}
        />
        <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
          <div className="mx-auto max-w-4xl space-y-4">
            <KitchenNav current="templates" />

            {templates.length === 0 ? (
              <EmptyState
                icon={<LayoutTemplate />}
                title="No templates yet"
                description="A template is the list you decided on, so a normal day's order is one tap instead of forty. The quickest way to make one is “Save as template” on a requisition you've already built."
                action={canWrite ? { label: 'Build one', href: '/kitchen/templates/new' } : undefined}
              />
            ) : (
              <ul className="space-y-2">
                {templates.map((t) => (
                  <li key={t.id}>
                    <Link
                      href={`/kitchen/templates/${t.id}`}
                      className={`flex items-center gap-3 rounded-xl border bg-white p-3 ${
                        t.is_active ? 'border-gray-200' : 'border-gray-200 opacity-60'}`}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-gray-900">
                          {t.name}
                          {!t.is_active && (
                            <span className="ml-1.5 rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-600">
                              hidden
                            </span>
                          )}
                        </span>
                        <span className="block text-xs text-gray-500">
                          {t.lines.length} item{t.lines.length === 1 ? '' : 's'}
                          {t.description ? ` · ${t.description}` : ''}
                        </span>
                      </span>
                      <ChevronRight size={16} className="flex-shrink-0 text-gray-400" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}

            {canWrite && templates.length > 0 && (
              <Link
                href="/kitchen/templates/new"
                className="flex min-h-[48px] w-full items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-gray-300 text-sm font-medium text-gray-600"
              >
                <Plus size={16} /> New template
              </Link>
            )}
          </div>
        </div>
      </div>
    )
  } catch (err) {
    return (
      <div className="px-4 py-6">
        <MigrationErrorBanner
          error={err instanceof Error ? err.message : String(err)}
          moduleName="Kitchen"
          migrationPath="migrations/kitchen-module/007_requisition_templates.sql"
        />
      </div>
    )
  }
}
