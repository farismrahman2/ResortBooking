'use client'

import { useState } from 'react'
import { CopyPlus, ChevronDown } from 'lucide-react'
import { formatDateShort } from '@/lib/formatters/dates'
import type { CopyableRequisition } from '@/lib/queries/kitchen'

/**
 * Start a new sheet from a recent one.
 *
 * A resort orders very nearly the same forty things every day. The quantities
 * move with the headcount; the list barely does. Retyping it every morning is
 * the most tedious thing in this module and the likeliest way to lose an item
 * nobody misses until the kitchen needs it.
 *
 * Quantities come across too. They are the right starting point far more often
 * than a blank box is, and adjusting a number already on screen is faster than
 * remembering one that isn't.
 */
export function StartFromPrevious({
  options, onPick,
}: {
  options: CopyableRequisition[]
  onPick:  (req: CopyableRequisition) => void
}) {
  const [open, setOpen] = useState(false)
  if (options.length === 0) return null

  const latest = options[0]

  return (
    <div className="rounded-xl border-2 border-dashed border-forest-300 bg-forest-50/40 p-3">
      <button
        type="button"
        onClick={() => onPick(latest)}
        className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-forest-700 px-3 text-sm font-semibold text-white"
      >
        <CopyPlus size={16} />
        Start from {latest.requisition_no} · {latest.lines.length} items
      </button>

      {options.length > 1 && (
        <>
          <button
            type="button" onClick={() => setOpen((v) => !v)}
            className="mt-2 flex w-full items-center justify-center gap-1 text-xs font-medium text-forest-800"
          >
            or pick another day
            <ChevronDown size={13} className={open ? 'rotate-180 transition' : 'transition'} />
          </button>
          {open && (
            <ul className="mt-2 space-y-1.5">
              {options.slice(1).map((r) => (
                <li key={r.id}>
                  <button
                    type="button" onClick={() => onPick(r)}
                    className="flex min-h-[44px] w-full items-center justify-between gap-2 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-800"
                  >
                    <span>{r.requisition_no} <span className="text-gray-500">· {formatDateShort(r.event_date)}</span></span>
                    <span className="text-xs text-gray-500">{r.lines.length} items</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <p className="mt-2 text-center text-[11px] text-gray-600">
        Copies the items and their quantities. Adjust from there, or add items below to build
        the sheet from scratch.
      </p>
    </div>
  )
}
