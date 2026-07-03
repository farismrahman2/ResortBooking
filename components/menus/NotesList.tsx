'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, X } from 'lucide-react'
import { addSpecialNote, removeSpecialNote } from '@/lib/actions/menus'
import { cn } from '@/lib/utils'
import type { MenuSpecialNoteRow, NoteColor } from '@/lib/supabase/types-menus'

const COLOR_STYLES: Record<NoteColor, { border: string; text: string; chip: string }> = {
  green: { border: 'border-l-green-600', text: 'text-green-800', chip: 'bg-green-600' },
  blue:  { border: 'border-l-blue-600',  text: 'text-blue-800',  chip: 'bg-blue-600' },
  red:   { border: 'border-l-red-600',   text: 'text-red-700',   chip: 'bg-red-600' },
}

interface Props {
  menuDayId: string
  mealId:    string | null   // null = day-level notes
  notes:     MenuSpecialNoteRow[]
  editable:  boolean
  onError:   (msg: string) => void
  compact?:  boolean
}

/** Colored kitchen-instruction notes — attached to the day or to one meal. */
export function NotesList({ menuDayId, mealId, notes, editable, onError, compact }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [adding, setAdding] = useState(false)
  const [text, setText] = useState('')
  const [color, setColor] = useState<NoteColor>('green')

  function add() {
    if (!text.trim()) return
    startTransition(async () => {
      const res = await addSpecialNote({ menu_day_id: menuDayId, meal_id: mealId, text: text.trim(), color })
      if (!res.success) { onError(res.error); return }
      setText('')
      setAdding(false)
      router.refresh()
    })
  }

  function remove(id: string) {
    startTransition(async () => {
      const res = await removeSpecialNote(id)
      if (!res.success) { onError(res.error); return }
      router.refresh()
    })
  }

  if (notes.length === 0 && !editable) return null

  return (
    <div className={cn('space-y-1.5', !compact && 'mt-1')}>
      {notes.map((n) => (
        <div
          key={n.id}
          className={cn(
            'flex items-start justify-between gap-2 rounded-r-lg border-l-4 bg-gray-50 px-3 py-2',
            COLOR_STYLES[n.color].border,
          )}
        >
          <p className={cn('text-sm font-medium', COLOR_STYLES[n.color].text)}>{n.text}</p>
          {editable && (
            <button onClick={() => remove(n.id)} disabled={pending}
              className="flex-shrink-0 rounded p-1 text-gray-300 hover:text-red-600" aria-label="Remove note">
              <X size={13} />
            </button>
          )}
        </div>
      ))}

      {editable && !adding && (
        <button
          onClick={() => setAdding(true)}
          className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-orange-700"
        >
          <Plus size={13} /> {mealId ? 'Note for this meal' : 'Special note (বিশেষ নির্দেশনা)'}
        </button>
      )}

      {editable && adding && (
        <div className="space-y-2 rounded-lg border border-gray-200 p-3">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={2}
            autoFocus
            placeholder="e.g. কনফারেন্স রুমের বাইরে চা ও কফি কর্নার থাকবে"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-200"
          />
          <div className="flex items-center justify-between">
            <div className="flex gap-2">
              {(['green', 'blue', 'red'] as const).map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={cn(
                    'h-6 w-6 rounded-full transition-transform',
                    COLOR_STYLES[c].chip,
                    color === c ? 'scale-110 ring-2 ring-offset-1 ring-gray-400' : 'opacity-50',
                  )}
                  aria-label={`${c} note`}
                />
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={() => { setAdding(false); setText('') }}
                className="rounded-lg px-3 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-100">
                Cancel
              </button>
              <button onClick={add} disabled={pending || !text.trim()}
                className="rounded-lg bg-orange-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-orange-700 disabled:opacity-40">
                Add note
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
