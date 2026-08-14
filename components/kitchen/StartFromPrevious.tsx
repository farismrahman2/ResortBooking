'use client'

import { useState } from 'react'
import Link from 'next/link'
import { CopyPlus, ChevronDown, LayoutTemplate, Plus } from 'lucide-react'
import { formatDateShort } from '@/lib/formatters/dates'
import type { CopyableRequisition } from '@/lib/queries/kitchen'
import type { TemplateWithLines } from '@/lib/supabase/types-kitchen'

/**
 * Start a new sheet from a template, or from a recent day.
 *
 * Templates lead, because they're the better answer and the difference
 * matters: a previous requisition is whatever happened to be ordered that day,
 * one-offs and omissions included, and copying it forward lets those drift
 * through the whole week. A template is the list somebody decided on.
 *
 * The recent-days option stays for the case a template doesn't cover — a
 * second wedding in a fortnight is easier to copy than to describe.
 *
 * Quantities come across either way. They are the right starting point far
 * more often than a blank box is, and adjusting a number already on screen is
 * faster than remembering one that isn't.
 */
export function StartFromPrevious({
  options, templates = [], onPick, onPickTemplate,
}: {
  options: CopyableRequisition[]
  templates?: TemplateWithLines[]
  onPick:  (req: CopyableRequisition) => void
  onPickTemplate?: (t: TemplateWithLines) => void
}) {
  const [open, setOpen] = useState(false)
  if (options.length === 0 && templates.length === 0) {
    return (
      <Link
        href="/kitchen/templates/new"
        className="flex min-h-[48px] w-full items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-gray-300 text-sm font-medium text-gray-600"
      >
        <Plus size={15} /> Build a template so tomorrow is one tap
      </Link>
    )
  }

  const latest = options[0]

  return (
    <div className="space-y-2 rounded-xl border-2 border-dashed border-forest-300 bg-forest-50/40 p-3">
      {templates.length > 0 && onPickTemplate && (
        <>
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-forest-800">
            <LayoutTemplate size={12} /> Templates
          </p>
          <ul className="space-y-1.5">
            {templates.map((t) => (
              <li key={t.id}>
                <button
                  type="button" onClick={() => onPickTemplate(t)}
                  className="flex min-h-[48px] w-full items-center justify-between gap-2 rounded-xl bg-forest-700 px-3 text-sm font-semibold text-white"
                >
                  <span className="min-w-0 truncate">{t.name}</span>
                  <span className="flex-shrink-0 text-xs font-normal opacity-80">
                    {t.lines.length} items
                  </span>
                </button>
                {t.description && (
                  <p className="mt-0.5 px-1 text-[11px] text-gray-600">{t.description}</p>
                )}
              </li>
            ))}
          </ul>
          <Link
            href="/kitchen/templates"
            className="block px-1 text-[11px] font-medium text-forest-800 underline"
          >
            Manage templates
          </Link>
        </>
      )}

      {latest && (
        <>
          {templates.length > 0 && (
            <p className="pt-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
              Or copy a day
            </p>
          )}
          <button
            type="button"
            onClick={() => onPick(latest)}
            className={templates.length > 0
              ? 'flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl border border-forest-300 bg-white px-3 text-sm font-semibold text-forest-800'
              : 'flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-forest-700 px-3 text-sm font-semibold text-white'}
          >
            <CopyPlus size={16} />
            {latest.requisition_no} · {latest.lines.length} items
          </button>
        </>
      )}

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
