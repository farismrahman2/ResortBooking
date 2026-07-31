import Link from 'next/link'
import { LogIn, LogOut, Users, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatBDT } from '@/lib/formatters/currency'
import type { TodaySnapshot, TodayRow } from '@/lib/queries/dashboard-today'

function greeting(now = new Date()): string {
  // Dhaka is UTC+6; derive the local hour without pulling in a tz library.
  const h = (now.getUTCHours() + 6) % 24
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

/**
 * Replaces the anonymous stat grid as the first thing on the dashboard.
 * The question a manager actually opens this page to answer is "what is
 * happening at the resort today" — not "what is the all-time booking count".
 */
export function TodayPanel({
  snapshot, name,
}: { snapshot: TodaySnapshot; name?: string | null }) {
  const { arrivals, departures, inHouse, roomsOccupied, totalRooms, occupancyPct } = snapshot
  const firstName = name?.trim().split(/\s+/)[0]

  const summary = [
    arrivals.length   ? `${arrivals.length} arrival${arrivals.length === 1 ? '' : 's'}` : null,
    departures.length ? `${departures.length} departure${departures.length === 1 ? '' : 's'}` : null,
    totalRooms ? `${roomsOccupied} of ${totalRooms} rooms occupied` : null,
  ].filter(Boolean).join(' · ')

  return (
    <section className="overflow-hidden rounded-2xl border border-forest-200 bg-gradient-to-br from-forest-50 to-white">
      <div className="px-5 pt-5">
        <h2 className="text-lg font-bold text-forest-900">
          {greeting()}{firstName ? `, ${firstName}` : ''}
        </h2>
        <p className="mt-0.5 text-sm text-forest-800/80">
          {summary || 'Nothing scheduled today — a quiet one.'}
        </p>
      </div>

      {/* Occupancy as a visual, not a percentage */}
      {totalRooms > 0 && (
        <div className="px-5 pt-4">
          <div className="flex items-baseline justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-forest-800/70">
              Tonight&apos;s occupancy
            </span>
            <span className="text-sm font-bold tabular-nums text-forest-900">{occupancyPct}%</span>
          </div>
          <div className="mt-1.5 flex gap-1" aria-label={`${roomsOccupied} of ${totalRooms} rooms occupied`}>
            {Array.from({ length: totalRooms }, (_, i) => (
              <span
                key={i}
                className={cn(
                  'h-2.5 flex-1 rounded-full',
                  i < roomsOccupied ? 'bg-forest-600' : 'bg-forest-200/60',
                )}
              />
            ))}
          </div>
          {inHouse > 0 && (
            <p className="mt-1.5 flex items-center gap-1 text-xs text-forest-800/70">
              <Users size={12} /> {inHouse} guest{inHouse === 1 ? '' : 's'} staying over
            </p>
          )}
        </div>
      )}

      <div className="grid gap-px bg-forest-100 p-5 sm:grid-cols-2">
        <TodayList
          title="Arriving today" icon={<LogIn size={14} />} rows={arrivals}
          empty="No arrivals today" tone="forest"
        />
        <TodayList
          title="Departing today" icon={<LogOut size={14} />} rows={departures}
          empty="No departures today" tone="amber" hrefBase="/checkout"
        />
      </div>
    </section>
  )
}

function TodayList({
  title, icon, rows, empty, tone, hrefBase = '/bookings',
}: {
  title: string; icon: React.ReactNode; rows: TodayRow[]
  empty: string; tone: 'forest' | 'amber'; hrefBase?: string
}) {
  const toneCls = tone === 'forest' ? 'text-forest-700' : 'text-amber-700'
  return (
    <div className="bg-white p-3 first:rounded-l-xl last:rounded-r-xl max-sm:rounded-xl">
      <p className={cn('flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide', toneCls)}>
        {icon} {title}
        <span className="ml-auto rounded-full bg-gray-100 px-1.5 text-[10px] text-gray-600">{rows.length}</span>
      </p>
      {rows.length === 0 ? (
        <p className="py-4 text-center text-xs text-gray-400">{empty}</p>
      ) : (
        <ul className="mt-2 space-y-1">
          {rows.slice(0, 5).map((r) => (
            <li key={r.id}>
              <Link
                href={`${hrefBase}/${r.id}`}
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-gray-50"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-gray-900">{r.customer_name}</span>
                  <span className="block truncate text-[11px] text-gray-500">
                    {r.room_numbers.length ? `Room ${r.room_numbers.join(', ')}` : r.booking_number}
                    {' · '}{r.guests} guest{r.guests === 1 ? '' : 's'}
                    {r.remaining > 0 && <span className="text-red-600"> · {formatBDT(r.remaining)} due</span>}
                  </span>
                </span>
                <ChevronRight size={14} className="flex-shrink-0 text-gray-300" />
              </Link>
            </li>
          ))}
          {rows.length > 5 && (
            <li className="pt-1 text-center text-[11px] text-gray-500">+{rows.length - 5} more</li>
          )}
        </ul>
      )}
    </div>
  )
}
