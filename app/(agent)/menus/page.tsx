import Link from 'next/link'
import { Topbar } from '@/components/layout/Topbar'
import { requirePermission, hasPermission } from '@/lib/auth/permissions'
import { listMenuDays, type MenuDayListRow } from '@/lib/queries/menus'
import { banglaDate, banglaWeekday, toBanglaDigits, BANGLA_MONTHS } from '@/lib/menus/bangla-numerals'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: { m?: string }
}

function monthBounds(ym: string): { first: string; last: string; year: number; month: number } {
  const [y, m] = ym.split('-').map(Number)
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const pad = (n: number) => String(n).padStart(2, '0')
  return { first: `${y}-${pad(m)}-01`, last: `${y}-${pad(m)}-${pad(lastDay)}`, year: y, month: m }
}

function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + delta, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

export default async function MenusPage({ searchParams }: PageProps) {
  await requirePermission('menus', 'read')
  const canWrite = await hasPermission('menus', 'write')

  const now = new Date().toISOString().slice(0, 7)
  const ym = /^\d{4}-\d{2}$/.test(searchParams.m ?? '') ? searchParams.m! : now
  const { first, last, year, month } = monthBounds(ym)

  let migrationError: string | null = null
  let days: MenuDayListRow[] = []
  try {
    days = await listMenuDays({ from: first, to: last, limit: 200 })
  } catch (err) {
    migrationError = err instanceof Error ? err.message : String(err)
  }

  // Group menus by date for the calendar cells
  const byDate = new Map<string, MenuDayListRow[]>()
  for (const d of days) {
    if (!byDate.has(d.menu_date)) byDate.set(d.menu_date, [])
    byDate.get(d.menu_date)!.push(d)
  }

  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay()  // 0 = Sunday
  const pad = (n: number) => String(n).padStart(2, '0')
  const todayIso = new Date().toISOString().slice(0, 10)

  return (
    <div className="flex h-full flex-col">
      <Topbar
        title="Meal Menus"
        subtitle="খাবারের মেনু — daily kitchen meal plans"
        action={canWrite ? { label: 'New menu', href: '/menus/new' } : undefined}
      />
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 space-y-5">
        {migrationError ? (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
            <p className="font-semibold">Meal Menus module not ready</p>
            <p className="mt-1">
              Apply <code className="rounded bg-amber-100 px-1">migrations/menus-module/000_create_menu_tables.sql</code>{' '}
              in the Supabase SQL editor, then reload.
            </p>
            <p className="mt-2 font-mono text-xs text-amber-700">{migrationError}</p>
          </div>
        ) : (
          <>
            {/* Month navigation */}
            <div className="flex items-center justify-between">
              <Link href={`/menus?m=${shiftMonth(ym, -1)}`} className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50">←</Link>
              <p className="text-base font-semibold text-gray-900">
                {BANGLA_MONTHS[month - 1]} {toBanglaDigits(year)}
              </p>
              <Link href={`/menus?m=${shiftMonth(ym, 1)}`} className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50">→</Link>
            </div>

            {/* Month grid — desktop/tablet */}
            <div className="hidden sm:block overflow-hidden rounded-xl border border-gray-200 bg-white">
              <div className="grid grid-cols-7 border-b border-gray-100 text-center text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                  <div key={d} className="py-2">{d}</div>
                ))}
              </div>
              <div className="grid grid-cols-7">
                {Array.from({ length: firstWeekday }).map((_, i) => (
                  <div key={`pad-${i}`} className="h-20 border-b border-r border-gray-50" />
                ))}
                {Array.from({ length: daysInMonth }).map((_, i) => {
                  const dateIso = `${year}-${pad(month)}-${pad(i + 1)}`
                  const cellMenus = byDate.get(dateIso) ?? []
                  const href = cellMenus.length > 0
                    ? `/menus/${cellMenus[0].id}`
                    : canWrite ? `/menus/new?date=${dateIso}` : undefined
                  const inner = (
                    <>
                      <span className={cn('text-xs font-semibold', dateIso === todayIso ? 'text-orange-700' : 'text-gray-600')}>
                        {toBanglaDigits(i + 1)}
                      </span>
                      <span className="mt-1 flex flex-wrap gap-1">
                        {cellMenus.map((m) => (
                          <span
                            key={m.id}
                            className={cn('h-2.5 w-2.5 rounded-full', m.status === 'finalized' ? 'bg-green-500' : 'bg-orange-400')}
                            title={`${m.occasion_note ?? ''} (${m.status})`}
                          />
                        ))}
                      </span>
                    </>
                  )
                  return href ? (
                    <Link key={dateIso} href={href}
                      className={cn('flex h-20 flex-col border-b border-r border-gray-50 p-1.5 hover:bg-orange-50', dateIso === todayIso && 'bg-orange-50/60')}>
                      {inner}
                    </Link>
                  ) : (
                    <div key={dateIso} className="flex h-20 flex-col border-b border-r border-gray-50 p-1.5">{inner}</div>
                  )
                })}
              </div>
            </div>

            {/* Legend */}
            <p className="hidden sm:flex items-center gap-4 text-xs text-gray-500">
              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-orange-400" /> Draft</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-green-500" /> Finalized</span>
              <span>Tap an empty date to quick-create.</span>
            </p>

            {/* This month's menus — primary view on mobile, detail list on desktop */}
            {days.length === 0 ? (
              <div className="rounded-lg border border-dashed border-gray-200 p-10 text-center">
                <p className="text-sm text-gray-400">No menus in {BANGLA_MONTHS[month - 1]}.</p>
                {canWrite && (
                  <Link href="/menus/new" className="mt-2 inline-block text-sm font-medium text-orange-700 hover:underline">
                    Create one →
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
          </>
        )}
      </div>
    </div>
  )
}
