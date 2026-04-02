'use client'

import { NumberInput } from '@/components/ui/NumberInput'
import type { RoomInventoryRow } from '@/lib/supabase/types'

interface RoomPriceEditorProps {
  inventory: RoomInventoryRow[]
  value: Record<string, number>
  onChange: (roomType: string, price: number) => void
  packageType: 'daylong' | 'night'
}

export function RoomPriceEditor({
  inventory,
  value,
  onChange,
  packageType,
}: RoomPriceEditorProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {inventory.map((room) => {
        const isDisabled = packageType === 'night' && room.daylong_only

        return (
          <div key={room.room_type}>
            {isDisabled ? (
              <div className="w-full">
                <label className="field-label">{room.display_name}</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400 pointer-events-none select-none">
                    ৳
                  </span>
                  <input
                    type="text"
                    disabled
                    value="N/A"
                    className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 pl-7 pr-3 text-sm text-gray-400"
                    readOnly
                  />
                </div>
                <p className="mt-1 text-xs text-gray-400">N/A (Daylong Only)</p>
              </div>
            ) : (
              <NumberInput
                label={room.display_name}
                prefix="৳"
                value={value[room.room_type] ?? 0}
                onChange={(price) => onChange(room.room_type, price)}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
