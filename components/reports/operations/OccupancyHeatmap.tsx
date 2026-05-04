'use client'

import { format, parseISO, getDay } from 'date-fns'
import type { OccupancyDay } from '@/lib/queries/reports/operations'

function tone(pct: number | null): string {
  if (pct === null) return 'bg-gray-100'
  if (pct >= 85) return 'bg-indigo-700 text-white'
  if (pct >= 65) return 'bg-indigo-500 text-white'
  if (pct >= 40) return 'bg-indigo-300'
  if (pct >= 15) return 'bg-indigo-100'
  return 'bg-gray-100'
}

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function OccupancyHeatmap({ days }: { days: OccupancyDay[] }) {
  if (days.length === 0) {
    return <p className="text-sm text-gray-500">No data for this period.</p>
  }
  // Pad the front so the first day lines up under its weekday column
  const first = parseISO(days[0].date)
  const leading = getDay(first)
  const cells: Array<OccupancyDay | null> = []
  for (let i = 0; i < leading; i++) cells.push(null)
  for (const d of days) cells.push(d)

  return (
    <div className="space-y-2 overflow-auto">
      <div className="grid grid-cols-7 gap-1 text-[10px] font-semibold uppercase text-gray-500">
        {WEEKDAY_LABELS.map((l) => <div key={l} className="text-center">{l}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((c, i) => c === null ? (
          <div key={`pad-${i}`} className="h-10 rounded bg-transparent" />
        ) : (
          <div key={c.date}
            className={`flex h-10 flex-col items-center justify-center rounded text-[10px] font-semibold ${tone(c.occupancy_pct)}`}
            title={`${format(parseISO(c.date), 'EEE d MMM yyyy')} — ${c.rooms_occupied}/${c.total_rooms} rooms (${c.occupancy_pct?.toFixed(1) ?? '—'}%)`}>
            <span>{format(parseISO(c.date), 'd')}</span>
            <span className="text-[9px] opacity-80">{c.occupancy_pct?.toFixed(0) ?? '—'}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}
