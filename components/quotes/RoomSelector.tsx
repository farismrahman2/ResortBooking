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
  bookedRoomNumbers?: string[]   // room numbers already taken (shown in red)
}

export function RoomSelector({
  rooms,
  selectedPackage,
  packageType,
  value,
  onChange,
  bookedRoomNumbers = [],
}: RoomSelectorProps) {
  const visibleRooms = rooms.filter((room) => {
    if (packageType === 'night' && room.room_type === 'tree_house') return false
    return true
  })

  function getRoom(roomType: string): RoomSelection | undefined {
    return value.find((r) => r.room_type === roomType)
  }

  function getQty(roomType: string): number {
    return getRoom(roomType)?.qty ?? 0
  }

  function getSelectedNums(roomType: string): string[] {
    return getRoom(roomType)?.room_numbers ?? []
  }

  function getUnitPrice(roomType: string): number {
    if (!selectedPackage) return 0
    return selectedPackage.room_prices.find((r) => r.room_type === roomType)?.price ?? 0
  }

  function setQty(room: RoomInventoryRow, qty: number) {
    const unitPrice    = getUnitPrice(room.room_type)
    const currentNums  = getSelectedNums(room.room_type)
    const next         = value.filter((r) => r.room_type !== room.room_type)
    if (qty > 0) {
      next.push({
        room_type:    room.room_type,
        display_name: room.display_name,
        qty,
        unit_price:   unitPrice,
        room_numbers: currentNums.slice(0, qty),   // trim if qty decreased
      })
    }
    onChange(next)
  }

  function toggleRoomNumber(roomType: string, roomNum: string, maxQty: number) {
    const current = getSelectedNums(roomType)
    let newNums: string[]
    if (current.includes(roomNum)) {
      newNums = current.filter((n) => n !== roomNum)
    } else {
      if (current.length >= maxQty) return   // at capacity
      newNums = [...current, roomNum]
    }
    onChange(value.map((r) =>
      r.room_type === roomType ? { ...r, room_numbers: newNums } : r,
    ))
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
        const qty        = getQty(room.room_type)
        const price      = getUnitPrice(room.room_type)
        const isSelected = qty > 0
        const fixedNums  = ROOM_NUMBERS[room.room_type as RoomType] ?? []
        const selectedNums = getSelectedNums(room.room_type)

        return (
          <div
            key={room.room_type}
            className={cn(
              'rounded-lg border px-4 py-3 transition-colors',
              isSelected ? 'border-forest-300 bg-forest-50' : 'border-gray-200 bg-white',
            )}
          >
            {/* Qty row */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0">
                <div>
                  <p className="text-sm font-medium text-gray-900">{room.display_name}</p>
                  <p className="text-xs text-gray-500">
                    {room.total_units} unit{room.total_units !== 1 ? 's' : ''} available
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-4 flex-shrink-0">
                {price > 0 ? (
                  <span className="text-sm font-mono text-gray-700 w-20 text-right">
                    {formatBDT(price)}/rm
                  </span>
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
                      qty > 0
                        ? 'border-forest-400 bg-forest-100 text-forest-700 hover:bg-forest-200'
                        : 'border-gray-200 bg-gray-50 text-gray-300 cursor-not-allowed',
                    )}
                  >
                    −
                  </button>
                  <span className={cn(
                    'w-8 text-center text-sm font-semibold tabular-nums',
                    isSelected ? 'text-forest-700' : 'text-gray-600',
                  )}>
                    {qty}
                  </span>
                  <button
                    type="button"
                    disabled={qty >= room.total_units || noPackage}
                    onClick={() => setQty(room, Math.min(room.total_units, qty + 1))}
                    className={cn(
                      'h-7 w-7 rounded border flex items-center justify-center text-sm font-medium transition-colors',
                      qty < room.total_units
                        ? 'border-forest-400 bg-forest-100 text-forest-700 hover:bg-forest-200'
                        : 'border-gray-200 bg-gray-50 text-gray-300 cursor-not-allowed',
                    )}
                  >
                    +
                  </button>
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
                    const isTaken    = bookedRoomNumbers.includes(num) && !selectedNums.includes(num)
                    const isPicked   = selectedNums.includes(num)
                    return (
                      <button
                        key={num}
                        type="button"
                        onClick={() => !isTaken && toggleRoomNumber(room.room_type, num, qty)}
                        disabled={isTaken}
                        title={isTaken ? `Room ${num} is already booked` : undefined}
                        className={cn(
                          'rounded-md border px-2.5 py-1 text-xs font-mono font-semibold transition-colors',
                          isPicked
                            ? 'border-forest-500 bg-forest-600 text-white'
                            : isTaken
                            ? 'border-red-300 bg-red-50 text-red-400 cursor-not-allowed'
                            : 'border-gray-300 bg-white text-gray-700 hover:border-forest-400 hover:bg-forest-50',
                        )}
                      >
                        {num}
                      </button>
                    )
                  })}
                </div>
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
