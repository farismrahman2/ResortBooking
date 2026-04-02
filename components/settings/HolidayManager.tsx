'use client'

import { useState, useTransition } from 'react'
import { Trash2, Plus } from 'lucide-react'
import { addHolidayDate, deleteHolidayDate } from '@/lib/actions/settings'
import type { HolidayDateRow } from '@/lib/supabase/types'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { formatDate } from '@/lib/formatters/dates'

interface HolidayManagerProps {
  initialHolidays: HolidayDateRow[]
}

export function HolidayManager({ initialHolidays }: HolidayManagerProps) {
  const [holidays, setHolidays] = useState<HolidayDateRow[]>(initialHolidays)
  const [newDate, setNewDate] = useState('')
  const [newLabel, setNewLabel] = useState('')
  const [addError, setAddError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const handleAdd = () => {
    if (!newDate || !newLabel.trim()) {
      setAddError('Both date and label are required')
      return
    }
    setAddError(null)

    // Optimistic add
    const tempId = `temp-${Date.now()}`
    const optimisticEntry: HolidayDateRow = {
      id: tempId,
      date: newDate,
      label: newLabel.trim(),
      created_at: new Date().toISOString(),
    }
    setHolidays((prev) =>
      [...prev, optimisticEntry].sort((a, b) => a.date.localeCompare(b.date)),
    )
    const savedDate = newDate
    const savedLabel = newLabel.trim()
    setNewDate('')
    setNewLabel('')

    startTransition(async () => {
      const result = await addHolidayDate(savedDate, savedLabel)
      if (!result.success) {
        // Revert optimistic update
        setHolidays((prev) => prev.filter((h) => h.id !== tempId))
        setAddError(result.error ?? 'Failed to add holiday')
      }
      // On success, revalidatePath will refresh server data, but we keep optimistic state
    })
  }

  const handleDelete = (id: string) => {
    // Optimistic delete
    setHolidays((prev) => prev.filter((h) => h.id !== id))

    startTransition(async () => {
      const result = await deleteHolidayDate(id)
      if (!result.success) {
        // Revert: refetch would normally handle this, but since we don't have the item,
        // we just note the error. The page will refresh on next navigation.
        console.error('Failed to delete holiday:', result.error)
      }
    })
  }

  // Group holidays by year
  const grouped = holidays.reduce<Record<string, HolidayDateRow[]>>((acc, h) => {
    const year = h.date.split('-')[0]
    if (!acc[year]) acc[year] = []
    acc[year].push(h)
    return acc
  }, {})

  const sortedYears = Object.keys(grouped).sort()

  return (
    <div className="space-y-5">
      {/* List of holidays */}
      <div className="space-y-4">
        {holidays.length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">No holidays added yet.</p>
        ) : (
          sortedYears.map((year) => (
            <div key={year}>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                {year}
              </p>
              <div className="space-y-1">
                {grouped[year].map((holiday) => (
                  <div
                    key={holiday.id}
                    className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5"
                  >
                    <div>
                      <span className="text-sm font-medium text-gray-900">{holiday.label}</span>
                      <span className="ml-2 text-xs text-gray-500">{formatDate(holiday.date)}</span>
                    </div>
                    <button
                      onClick={() => handleDelete(holiday.id)}
                      disabled={isPending || holiday.id.startsWith('temp-')}
                      className="text-gray-400 hover:text-red-600 transition-colors disabled:opacity-40 p-1 rounded"
                      title="Remove holiday"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Add new holiday form */}
      <div className="border-t border-gray-200 pt-4 space-y-3">
        <p className="text-sm font-semibold text-gray-700">Add Holiday</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input
            label="Date"
            type="date"
            value={newDate}
            onChange={(e) => setNewDate(e.target.value)}
          />
          <Input
            label="Label"
            placeholder='e.g. "Eid ul-Fitr"'
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
          />
        </div>
        {addError && <p className="text-xs text-red-600">{addError}</p>}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleAdd}
          disabled={isPending}
        >
          <Plus size={14} />
          Add Holiday
        </Button>
      </div>
    </div>
  )
}
