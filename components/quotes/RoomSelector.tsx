'use client'

import { cn } from '@/lib/utils'
import { formatBDT } from '@/lib/formatters/currency'
import { ROOM_NUMBERS } from '@/lib/config/rooms'
import type { RoomInventoryRow, PackageWithPrices, RoomType } from '@/lib/supabase/types'
import type { RoomSelection } from '@/lib/engine/calculator'

interface RoomSelectorProps {
  rooms: RoomInventoryRow[]
  selectedPackage: PackageWithPrices | null
  packageType: 'daylong' | 'night'
  value: RoomSelection[]
  onChange: (rooms: RoomSelection[]) => void
  /** Cannot be picked at all (red). */
  bookedRoomNumbers?: string[]
  /** Day visits: previous guest checks out ~noon (yellow, selectable). */
  noonRoomNumbers?: string[]
  /** Night stays: held by day guests on arrival day — selectable only as a
   *  room handed over in the evening (amber; picking it marks it so). */
  eveningOnlyRoomNumbers?: string[]
  /** Day visits: a night guest arrives this evening — fine, just say so. */
  untilEveningRoomNumbers?: string[]
  /** "6:00 PM" — the resort's evening handover time, for labels. */
  handoverLabel?: string
}

/**
 * Room type quantities plus physical room numbers.
 *
 * For a night stay, every picked room can be flagged for EVENING HANDOVER:
 * the guests get it after that day's day guests leave, and the day on that
 * room stays sellable. Rooms already held by day guests can only be picked
 * that way, and are flagged automatically.
 */
export function RoomSelector({
  rooms,
  selectedPackage,
  packageType,
  value,
  onChange,
  bookedRoomNumbers = [],
  noonRoomNumbers = [],
  eveningOnlyRoomNumbers = [],
  untilEveningRoomNumbers = [],
  handoverLabel = '6:00 PM',
}: RoomSelectorProps) {
  const isNight = packageType === 'night'
  const visibleRooms = rooms.filter((room) => !(isNight && room.room_type === 'tree_house'))

  const getRoom = (roomType: string) => value.find((r) => r.room_type === roomType)
  const getQty  = (roomType: string) => getRoom(roomType)?.qty ?? 0
  const getSelectedNums = (roomType: string) => getRoom(roomType)?.room_numbers ?? []
  const getEvening = (roomType: string) => getRoom(roomType)?.evening_rooms ?? []
  const getUnitPrice = (roomType: string) =>
    selectedPackage?.room_prices.find((r) => r.room_type === roomType)?.price ?? 0

  function setQty(room: RoomInventoryRow, qty: number) {
    const currentNums = getSelectedNums(room.room_type)
    const nextNums    = currentNums.slice(0, qty)   // trim if qty decreased
    const next        = value.filter((r) => r.room_type !== room.room_type)
    if (qty > 0) {
      next.push({
        room_type:     room.room_type,
        display_name:  room.display_name,
        qty,
        unit_price:    getUnitPrice(room.room_type),
        room_numbers:  nextNums,
        evening_rooms: getEvening(room.room_type).filter((n) => nextNums.includes(n)),
      })
    }
    onChange(next)
  }

  function toggleRoomNumber(roomType: string, roomNum: string, maxQty: number, eveningOnly: boolean) {
    const current = getSelectedNums(roomType)
    const evening = getEvening(roomType)
    let newNums: string[]
    let newEvening: string[]
    if (current.includes(roomNum)) {
      newNums    = current.filter((n) => n !== roomNum)
      newEvening = evening.filter((n) => n !== roomNum)
    } else {
      if (current.length >= maxQty) return   // at capacity
      newNums    = [...current, roomNum]
      // A day-held room can only be had in the evening — flag it on the way in.
      newEvening = eveningOnly && isNight ? [...evening, roomNum] : evening
    }
    onChange(value.map((r) =>
      r.room_type === roomType ? { ...r, room_numbers: newNums, evening_rooms: newEvening } : r,
    ))
  }

  function toggleEvening(roomType: string, roomNum: string) {
    const evening = getEvening(roomType)
    const isEveningOnly = eveningOnlyRoomNumbers.includes(roomNum)
    // A day-held room cannot be switched back to an instant room.
    if (evening.includes(roomNum) && isEveningOnly) return
    const newEvening = evening.includes(roomNum) ? evening.filter((n) => n !== roomNum) : [...evening, roomNum]
    onChange(value.map((r) => (r.room_type === roomType ? { ...r, evening_rooms: newEvening } : r)))
  }

  const noPackage = !selectedPackage

  return (
    <div className="relative space-y-2">
      {noPackage && (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-white/80 backdrop-blur-sm">
          <p className="text-sm font-medium text-gray-500">Select a package first</p>
        </div>
      )}

      {visibleRooms.map((room) => {
        const qty          = getQty(room.room_type)
        const price        = getUnitPrice(room.room_type)
        const isSelected   = qty > 0
        const fixedNums    = ROOM_NUMBERS[room.room_type as RoomType] ?? []
        const selectedNums = getSelectedNums(room.room_type)
        const eveningNums  = getEvening(room.room_type)

        // Per-category availability. Only room types with fixed numbers can be
        // classified per-room; others (e.g. tree_house) fall back to total_units.
        const takenCount     = fixedNums.filter((n) => bookedRoomNumbers.includes(n)).length
        const availableUnits = Math.max(0, room.total_units - takenCount)
        const isFullyBooked  = fixedNums.length > 0 && availableUnits === 0
        const maxSelectable  = fixedNums.length > 0 ? availableUnits : room.total_units
        const noonCount      = fixedNums.filter((n) => noonRoomNumbers.includes(n) && !bookedRoomNumbers.includes(n)).length
        const eveningOnlyCount = fixedNums.filter((n) => eveningOnlyRoomNumbers.includes(n) && !bookedRoomNumbers.includes(n)).length
        const untilEveningCount = fixedNums.filter((n) => untilEveningRoomNumbers.includes(n) && !bookedRoomNumbers.includes(n)).length
        const availableNow   = Math.max(0, availableUnits - noonCount - eveningOnlyCount)

        return (
          <div
            key={room.room_type}
            className={cn(
              'rounded-lg border px-4 py-3 transition-colors',
              isFullyBooked ? 'border-red-300 bg-red-50' : isSelected ? 'border-forest-300 bg-forest-50' : 'border-gray-200 bg-white',
            )}
          >
            {/* Qty row */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">{room.display_name}</p>
                    {isFullyBooked && (
                      <span className="rounded-full border border-red-300 bg-red-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-700 whitespace-nowrap flex-shrink-0">
                        Fully booked
                      </span>
                    )}
                  </div>
                  <p className={cn('text-xs', isFullyBooked ? 'text-red-600 font-medium' : 'text-gray-500')}>
                    {isFullyBooked ? (
                      'Fully booked — no rooms available'
                    ) : (noonCount > 0 || eveningOnlyCount > 0) ? (
                      <>
                        {availableNow} available now
                        {noonCount > 0 && <span className="text-amber-600 font-medium"> · {noonCount} after 12 PM</span>}
                        {eveningOnlyCount > 0 && <span className="text-orange-700 font-medium"> · {eveningOnlyCount} from {handoverLabel}</span>}
                      </>
                    ) : takenCount > 0 ? (
                      `${availableUnits} of ${room.total_units} available`
                    ) : (
                      `${room.total_units} unit${room.total_units !== 1 ? 's' : ''} available`
                    )}
                    {untilEveningCount > 0 && (
                      <span className="text-sky-700"> · {untilEveningCount} free until {handoverLabel}</span>
                    )}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-4 flex-shrink-0">
                {price > 0 ? (
                  <span className="text-sm font-mono text-gray-700 w-20 text-right">{formatBDT(price)}/rm</span>
                ) : (
                  <span className="text-xs text-gray-400 w-20 text-right">No price set</span>
                )}
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={qty <= 0 || noPackage}
                    onClick={() => setQty(room, Math.max(0, qty - 1))}
                    className={cn(
                      'h-7 w-7 rounded border flex items-center justify-center text-sm font-medium transition-colors',
                      qty > 0 ? 'border-forest-400 bg-forest-100 text-forest-700 hover:bg-forest-200'
                              : 'border-gray-200 bg-gray-50 text-gray-300 cursor-not-allowed',
                    )}
                  >−</button>
                  <span className={cn('w-8 text-center text-sm font-semibold tabular-nums', isSelected ? 'text-forest-700' : 'text-gray-600')}>
                    {qty}
                  </span>
                  <button
                    type="button"
                    disabled={qty >= maxSelectable || noPackage || isFullyBooked}
                    onClick={() => setQty(room, Math.min(maxSelectable, qty + 1))}
                    className={cn(
                      'h-7 w-7 rounded border flex items-center justify-center text-sm font-medium transition-colors',
                      qty < maxSelectable && !isFullyBooked
                        ? 'border-forest-400 bg-forest-100 text-forest-700 hover:bg-forest-200'
                        : 'border-gray-200 bg-gray-50 text-gray-300 cursor-not-allowed',
                    )}
                  >+</button>
                </div>
              </div>
            </div>

            {/* Room number picker — shown when qty > 0 and fixed numbers exist */}
            {qty > 0 && fixedNums.length > 0 && (
              <div className="mt-3 pt-2 border-t border-forest-200">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-2">
                  Room Numbers — select {qty}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {fixedNums.map((num) => {
                    const isPicked      = selectedNums.includes(num)
                    const isTaken       = bookedRoomNumbers.includes(num) && !isPicked
                    const isNoon        = !isTaken && noonRoomNumbers.includes(num)
                    const isEveningOnly = !isTaken && eveningOnlyRoomNumbers.includes(num)
                    const isUntilEve    = !isTaken && untilEveningRoomNumbers.includes(num)
                    const isEvening     = isPicked && eveningNums.includes(num)
                    const title = isTaken ? `Room ${num} is already booked`
                      : isEveningOnly ? `Room ${num} is with day guests until ${handoverLabel} — available for the night from then`
                      : isNoon ? `Room ${num} is available after 12:00 PM (previous guest checking out)`
                      : isUntilEve ? `Room ${num} is free until ${handoverLabel} (a night guest arrives then)`
                      : undefined
                    return (
                      <span key={num} className="inline-flex items-stretch">
                        <button
                          type="button"
                          onClick={() => !isTaken && toggleRoomNumber(room.room_type, num, qty, isEveningOnly)}
                          disabled={isTaken}
                          title={title}
                          className={cn(
                            'rounded-md border px-2.5 py-1 text-xs font-mono font-semibold transition-colors',
                            isPicked && isNight ? 'rounded-r-none' : '',
                            isPicked
                              ? isEvening ? 'border-orange-500 bg-orange-600 text-white' : 'border-forest-500 bg-forest-600 text-white'
                              : isTaken
                              ? 'border-red-300 bg-red-50 text-red-400 cursor-not-allowed'
                              : isEveningOnly
                              ? 'border-orange-400 bg-orange-100 text-orange-800 hover:border-orange-500 hover:bg-orange-200'
                              : isNoon
                              ? 'border-amber-400 bg-amber-100 text-amber-800 hover:border-amber-500 hover:bg-amber-200'
                              : isUntilEve
                              ? 'border-sky-300 bg-sky-50 text-sky-800 hover:border-sky-400 hover:bg-sky-100'
                              : 'border-gray-300 bg-white text-gray-700 hover:border-forest-400 hover:bg-forest-50',
                          )}
                        >
                          {num}
                        </button>
                        {isPicked && isNight && (
                          <button
                            type="button"
                            onClick={() => toggleEvening(room.room_type, num)}
                            title={isEvening
                              ? (isEveningOnly ? `Room ${num} is with day guests until ${handoverLabel}` : `Handed over at ${handoverLabel} — click for on arrival`)
                              : `Handed over on arrival — click to hand over at ${handoverLabel} and keep the day sellable`}
                            className={cn(
                              'rounded-r-md border border-l-0 px-1.5 text-[10px] font-semibold transition-colors',
                              isEvening ? 'border-orange-500 bg-orange-100 text-orange-800' : 'border-forest-500 bg-forest-50 text-forest-700 hover:bg-forest-100',
                            )}
                          >
                            {isEvening ? '6PM' : 'now'}
                          </button>
                        )}
                      </span>
                    )
                  })}
                </div>
                {(noonCount > 0 || eveningOnlyCount > 0 || untilEveningCount > 0 || (isNight && selectedNums.length > 0)) && (
                  <p className="mt-1.5 text-[10px] text-gray-500 space-x-2">
                    {noonCount > 0 && <span className="text-amber-600">Yellow: free after 12:00 PM (previous guest checking out).</span>}
                    {eveningOnlyCount > 0 && <span className="text-orange-700">Orange: with day guests until {handoverLabel} — picked as an evening room.</span>}
                    {untilEveningCount > 0 && <span className="text-sky-700">Blue: free until {handoverLabel}.</span>}
                    {isNight && selectedNums.length > 0 && <span>Tap “now / 6PM” on a picked room to hand it over on arrival or at {handoverLabel} — an evening room’s day stays sellable.</span>}
                  </p>
                )}
                {selectedNums.length < qty && (
                  <p className="mt-1.5 text-[10px] text-amber-600">
                    Select {qty - selectedNums.length} more room{qty - selectedNums.length !== 1 ? 's' : ''}
                  </p>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
