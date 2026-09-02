import { Moon, Sun } from 'lucide-react'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import { rowsToSegments, presenceByDate, shortDayLabel, sortSegments } from '@/lib/bookings/group-itinerary'
import { describeRoom } from '@/lib/bookings/itinerary-lines'
import type { GroupDayWithRooms } from '@/lib/supabase/types'

/**
 * Read-only day-by-day view of a group itinerary — replaces the Guests and
 * Rooms cards on quote and booking detail pages, since for a group those two
 * things change every day.
 */
export function ItineraryCard({ days, title = 'Itinerary' }: { days?: GroupDayWithRooms[]; title?: string }) {
  const segments = sortSegments(rowsToSegments(days ?? []))
  const presence = presenceByDate(segments)
  const dates = presence.map((p) => p.date)

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      {segments.length === 0 ? (
        <p className="text-sm text-gray-400">No itinerary recorded</p>
      ) : (
        <div className="space-y-3">
          {dates.map((date) => {
            const p = presence.find((x) => x.date === date)!
            return (
              <div key={date} className="rounded-lg border border-gray-200">
                <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-gray-100 bg-gray-50 px-3 py-2">
                  <span className="text-sm font-semibold text-gray-900">{shortDayLabel(date)}</span>
                  <span className="text-xs text-gray-500">
                    {p.guests} on site
                    {p.rooms > 0 && ` · ${p.rooms} room${p.rooms === 1 ? '' : 's'}`}
                  </span>
                </div>
                <div className="divide-y divide-gray-100">
                  {segments.filter((s) => s.day_date === date).map((s) => {
                    const guests = s.adults + s.children_paid + s.children_free
                    const paid = s.rooms.filter((r) => r.unit_price > 0)
                    const comp = s.rooms.filter((r) => r.unit_price === 0)
                    return (
                      <div key={s.stay_kind} className="px-3 py-2 text-sm">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                            s.stay_kind === 'night' ? 'bg-indigo-50 text-indigo-700' : 'bg-amber-50 text-amber-700'}`}>
                            {s.stay_kind === 'night' ? <Moon size={11} /> : <Sun size={11} />}
                            {s.stay_kind === 'night' ? 'Overnight' : 'Day guests'}
                          </span>
                          <span className="font-medium text-gray-900">
                            {guests} guest{guests === 1 ? '' : 's'}
                          </span>
                          <span className="text-xs text-gray-500">
                            {s.adults} adult{s.adults === 1 ? '' : 's'}
                            {s.adults_comp > 0 && ` (${s.adults_comp} not charged)`}
                            {s.children_paid + s.children_free > 0 && ` · ${s.children_paid + s.children_free} children`}
                            {s.drivers > 0 && ` · ${s.drivers} driver${s.drivers === 1 ? '' : 's'}`}
                            {s.extra_beds > 0 && ` · ${s.extra_beds} extra bed${s.extra_beds === 1 ? '' : 's'}`}
                          </span>
                        </div>
                        {(paid.length > 0 || comp.length > 0) && (
                          <div className="mt-1.5 flex flex-wrap gap-1.5">
                            {paid.map((r) => (
                              <span key={r.room_type} className="inline-flex items-center rounded bg-forest-100 px-2 py-0.5 text-xs font-mono font-semibold text-forest-700">
                                {describeRoom(r)}
                              </span>
                            ))}
                            {comp.map((r) => (
                              <span key={`c-${r.room_type}`} className="inline-flex items-center rounded bg-emerald-100 px-2 py-0.5 text-xs font-mono font-semibold text-emerald-700">
                                🎁 {describeRoom(r)}
                              </span>
                            ))}
                          </div>
                        )}
                        {s.notes && <p className="mt-1 text-xs text-gray-500">{s.notes}</p>}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </Card>
  )
}
