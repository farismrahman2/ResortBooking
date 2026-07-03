'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { CheckCircle2, Unlock, Plus, Trash2 } from 'lucide-react'
import { MealBlock } from './MealBlock'
import { NotesList } from './NotesList'
import {
  addMeal, updateMenuDay, deleteMenuDay, finalizeMenuDay, reopenMenuDay,
} from '@/lib/actions/menus'
import { banglaDate, banglaWeekday } from '@/lib/menus/bangla-numerals'
import { cn } from '@/lib/utils'
import type { MenuBookingPrefill, MenuDayFull, MenuMealTypeRow } from '@/lib/supabase/types-menus'

interface Props {
  day:       MenuDayFull
  mealTypes: MenuMealTypeRow[]
  prefill:   MenuBookingPrefill | null
  canWrite:  boolean
  isAdmin:   boolean
}

export function MenuDayEditor({ day, mealTypes, prefill, canWrite, isAdmin }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [occasion, setOccasion] = useState(day.occasion_note ?? '')
  const [date, setDate] = useState(day.menu_date)
  const [typePickerOpen, setTypePickerOpen] = useState(false)

  const editable = canWrite && day.status === 'draft'
  const usedTypeIds = new Set(day.meals.map((m) => m.meal_type_id))

  function run(fn: () => Promise<{ success: boolean; error?: string }>, after?: () => void) {
    setError(null)
    startTransition(async () => {
      const res = await fn()
      if (!res.success) { setError(res.error ?? 'Failed'); return }
      after?.()
      router.refresh()
    })
  }

  function onAddMeal(typeId: string) {
    setTypePickerOpen(false)
    run(() => addMeal({
      menu_day_id:        day.id,
      meal_type_id:       typeId,
      // Guest counts default from the linked booking (editable after)
      headcount_total:    prefill?.total    ?? null,
      headcount_adults:   prefill?.adults   ?? null,
      headcount_children: prefill?.children ?? null,
      headcount_drivers:  prefill?.drivers  ?? null,
    }))
  }

  function onDeleteDay() {
    if (!confirm('Delete this entire menu day? This cannot be undone.')) return
    run(() => deleteMenuDay(day.id), () => router.push('/menus'))
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-4 sm:px-6 space-y-4 pb-24">
      {/* Sticky header: Bangla date + status + actions */}
      <div className="sticky top-0 z-10 -mx-4 border-b border-gray-200 bg-white/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-lg font-bold text-gray-900 leading-tight">{banglaDate(day.menu_date)}</p>
            <p className="text-sm text-gray-500">{banglaWeekday(day.menu_date)}</p>
          </div>
          <span
            className={cn(
              'rounded-full border px-2.5 py-1 text-[11px] font-semibold',
              day.status === 'finalized'
                ? 'border-green-200 bg-green-50 text-green-700'
                : 'border-orange-200 bg-orange-50 text-orange-700',
            )}
          >
            {day.status === 'finalized' ? 'Finalized' : 'খসড়া · Draft'}
          </span>

          {canWrite && day.status === 'draft' && (
            <button
              onClick={() => { if (confirm('Finalize this menu? Editing will be locked (admin can reopen).')) run(() => finalizeMenuDay(day.id)) }}
              disabled={pending || day.meals.length === 0}
              className="inline-flex items-center gap-1.5 rounded-lg bg-forest-700 px-3 py-2 text-xs font-medium text-white hover:bg-forest-800 disabled:opacity-40"
            >
              <CheckCircle2 size={14} /> Finalize
            </button>
          )}
          {isAdmin && day.status === 'finalized' && (
            <button
              onClick={() => run(() => reopenMenuDay(day.id))}
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              <Unlock size={14} /> Reopen
            </button>
          )}
        </div>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      {day.status === 'finalized' && (
        <p className="rounded-lg bg-green-50 px-3 py-2 text-xs text-green-800">
          This menu is finalized — the kitchen prints from this version. {isAdmin ? 'Use Reopen to edit.' : 'Ask an admin to reopen it for edits.'}
        </p>
      )}

      {/* Date + occasion */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="field-label">Menu date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            onBlur={() => date !== day.menu_date && run(() => updateMenuDay({ id: day.id, menu_date: date }))}
            disabled={!editable}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-200 disabled:bg-gray-50"
          />
        </div>
        <div>
          <label className="field-label">Occasion (উপলক্ষ)</label>
          <input
            value={occasion}
            onChange={(e) => setOccasion(e.target.value)}
            onBlur={() => (occasion.trim() || null) !== day.occasion_note && run(() => updateMenuDay({ id: day.id, occasion_note: occasion.trim() || null }))}
            disabled={!editable}
            placeholder="e.g. ডেকাথেলনঃ ৫২ জন"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-200 disabled:bg-gray-50"
          />
        </div>
      </div>

      {prefill && (
        <p className="rounded-lg bg-orange-50 px-3 py-2 text-xs text-orange-800">
          Linked to booking <span className="font-semibold">{prefill.booking_number}</span> ({prefill.customer_name}) —
          new meals pre-fill {prefill.total} জন ({prefill.adults} প্রাপ্তবয়স্ক, {prefill.children} শিশু, {prefill.drivers} ড্রাইভার).
        </p>
      )}

      {/* Meal blocks */}
      <div className="space-y-4">
        {day.meals.map((meal) => (
          <MealBlock key={`${meal.id}-${meal.items.length}-${day.status}`} meal={meal} editable={editable} onError={setError} />
        ))}
      </div>

      {/* Add meal */}
      {editable && (
        <div>
          {!typePickerOpen ? (
            <button
              onClick={() => setTypePickerOpen(true)}
              disabled={pending}
              className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-orange-300 px-4 py-3.5 text-sm font-medium text-orange-700 hover:bg-orange-50"
            >
              <Plus size={16} /> Add meal (খাবার যোগ করুন)
            </button>
          ) : (
            <div className="grid grid-cols-2 gap-2 rounded-xl border border-orange-200 p-3 sm:grid-cols-3">
              {mealTypes.map((t) => (
                <button
                  key={t.id}
                  onClick={() => onAddMeal(t.id)}
                  disabled={pending}
                  className={cn(
                    'rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors',
                    usedTypeIds.has(t.id)
                      ? 'border-gray-200 text-gray-400 hover:bg-gray-50'   // soft guidance, still addable
                      : 'border-orange-200 text-orange-800 hover:bg-orange-50',
                  )}
                >
                  {t.display_name}
                  {usedTypeIds.has(t.id) && <span className="block text-[10px] text-gray-400">already added</span>}
                </button>
              ))}
              <button onClick={() => setTypePickerOpen(false)}
                className="rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-500 hover:bg-gray-50">
                Cancel
              </button>
            </div>
          )}
        </div>
      )}

      {/* Day-level notes */}
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <p className="mb-2 text-sm font-semibold text-gray-900">Day notes (বিশেষ নির্দেশনা)</p>
        <NotesList menuDayId={day.id} mealId={null} notes={day.day_notes} editable={editable} onError={setError} />
      </div>

      {/* Danger zone */}
      {editable && (
        <div className="flex justify-between border-t border-gray-100 pt-4">
          <Link href="/menus" className="text-sm text-gray-500 hover:underline">← All menus</Link>
          <button
            onClick={onDeleteDay}
            disabled={pending}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-red-500 hover:text-red-700"
          >
            <Trash2 size={13} /> Delete menu day
          </button>
        </div>
      )}
    </div>
  )
}
