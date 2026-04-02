import { getAvailabilitySummary } from '@/lib/engine/availability'
import { Badge } from '@/components/ui/Badge'
import type { AvailabilityResult } from '@/lib/supabase/types'

interface AvailabilityGridProps {
  rooms: AvailabilityResult[]
}

export function AvailabilityGrid({ rooms }: AvailabilityGridProps) {
  const summary = getAvailabilitySummary(rooms)

  return (
    <div className="space-y-4">
      {/* Summary strip */}
      <div className="flex flex-wrap gap-3">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-3 py-1 text-sm font-medium text-green-700">
          <span className="h-2 w-2 rounded-full bg-green-500" />
          {summary.available} Fully Available
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-sm font-medium text-amber-700">
          <span className="h-2 w-2 rounded-full bg-amber-500" />
          {summary.partial} Partial
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-3 py-1 text-sm font-medium text-red-700">
          <span className="h-2 w-2 rounded-full bg-red-500" />
          {summary.fullyBooked} Fully Booked
        </span>
      </div>

      {/* Room cards grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {rooms.map((room) => {
          const pct       = room.total_units > 0 ? (room.booked / room.total_units) * 100 : 0
          const isAvail   = room.available > 0
          const borderCol = isAvail ? 'border-l-green-500' : 'border-l-red-500'

          return (
            <div
              key={room.room_type}
              className={`rounded-xl border border-gray-200 border-l-4 bg-white p-4 shadow-sm ${borderCol}`}
            >
              <div className="mb-2 flex items-start justify-between gap-1">
                <p className="text-sm font-semibold leading-tight text-gray-900">
                  {room.display_name}
                </p>
                {room.daylong_only && (
                  <Badge variant="warning" className="shrink-0 text-xs">Day</Badge>
                )}
              </div>

              {/* Progress bar */}
              <div className="mb-2 h-2 w-full overflow-hidden rounded-full bg-gray-100">
                <div
                  className={`h-full rounded-full transition-all ${
                    pct === 0 ? 'bg-green-400' : pct < 100 ? 'bg-amber-400' : 'bg-red-500'
                  }`}
                  style={{ width: `${Math.max(pct > 0 ? Math.max(pct, 8) : 0, 0)}%` }}
                />
              </div>

              <p className={`text-sm font-medium ${isAvail ? 'text-green-700' : 'text-red-600'}`}>
                {room.available} / {room.total_units} available
              </p>
              {room.booked > 0 && (
                <p className="mt-0.5 text-xs text-gray-500">{room.booked} booked</p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
