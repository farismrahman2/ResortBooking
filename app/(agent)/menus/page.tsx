import Link from 'next/link'
import { Topbar } from '@/components/layout/Topbar'
import { requirePermission, hasPermission } from '@/lib/auth/permissions'
import { listMenuDays } from '@/lib/queries/menus'
import { banglaDate, banglaWeekday } from '@/lib/menus/bangla-numerals'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'

export default async function MenusPage() {
  await requirePermission('menus', 'read')
  const canWrite = await hasPermission('menus', 'write')

  let migrationError: string | null = null
  let days: Awaited<ReturnType<typeof listMenuDays>> = []
  try {
    days = await listMenuDays({ limit: 120 })
  } catch (err) {
    migrationError = err instanceof Error ? err.message : String(err)
  }

  return (
    <div className="flex h-full flex-col">
      <Topbar
        title="Meal Menus"
        subtitle="খাবারের মেনু — daily kitchen meal plans"
        action={canWrite ? { label: 'New menu', href: '/menus/new' } : undefined}
      />
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        {migrationError ? (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
            <p className="font-semibold">Meal Menus module not ready</p>
            <p className="mt-1">
              Apply <code className="rounded bg-amber-100 px-1">migrations/menus-module/000_create_menu_tables.sql</code>{' '}
              in the Supabase SQL editor, then reload.
            </p>
            <p className="mt-2 font-mono text-xs text-amber-700">{migrationError}</p>
          </div>
        ) : days.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-200 p-10 text-center">
            <p className="text-sm text-gray-400">No menus yet.</p>
            {canWrite && (
              <Link href="/menus/new" className="mt-2 inline-block text-sm font-medium text-orange-700 hover:underline">
                Create the first menu →
              </Link>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {days.map((d) => (
              <Link
                key={d.id}
                href={`/menus/${d.id}`}
                className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3 hover:border-orange-300 transition-colors"
              >
                <div className="min-w-0">
                  <p className="font-semibold text-gray-900">
                    {banglaDate(d.menu_date)} <span className="font-normal text-gray-500">· {banglaWeekday(d.menu_date)}</span>
                  </p>
                  <p className="mt-0.5 truncate text-xs text-gray-500">
                    {d.occasion_note || '—'} · {d.meal_count} meal{d.meal_count === 1 ? '' : 's'}
                  </p>
                </div>
                <span
                  className={cn(
                    'ml-3 flex-shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold',
                    d.status === 'finalized'
                      ? 'border-green-200 bg-green-50 text-green-700'
                      : 'border-orange-200 bg-orange-50 text-orange-700',
                  )}
                >
                  {d.status === 'finalized' ? 'Finalized' : 'খসড়া · Draft'}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
