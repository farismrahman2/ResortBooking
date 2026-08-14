'use client'

import { useState, useTransition } from 'react'
import { LayoutTemplate, X } from 'lucide-react'
import { toast } from '@/lib/toast'
import { saveRequisitionAsTemplate } from '@/lib/actions/kitchen-templates'
import { safeCall } from '@/lib/actions/safe-call'

/**
 * Turn the sheet you just built into a standing list.
 *
 * Offered here rather than only on the templates screen because this is the
 * moment you know it's worth keeping — nobody builds a forty-line template
 * from an empty screen, but everybody has just finished one by hand.
 *
 * Saves the requisition first: the action reads the lines from the database,
 * not from the form, so an unsaved edit would be silently left out of the
 * template that gets used every morning afterwards.
 */
export function SaveAsTemplate({
  requisitionId, onBeforeSave,
}: {
  requisitionId: string
  onBeforeSave:  () => Promise<boolean>
}) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [pending, start] = useTransition()

  if (!open) {
    return (
      <button
        type="button" onClick={() => setOpen(true)}
        className="flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-xl border border-gray-300 bg-white text-sm font-medium text-gray-700"
      >
        <LayoutTemplate size={15} /> Save this list as a template
      </button>
    )
  }

  return (
    <div className="space-y-2.5 rounded-xl border border-forest-300 bg-white p-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-800">Save as a template</p>
        <button type="button" onClick={() => setOpen(false)} aria-label="Close"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400">
          <X size={15} />
        </button>
      </div>
      <input
        value={name} onChange={(e) => setName(e.target.value)}
        placeholder="e.g. Standard day"
        autoFocus
        className="min-h-[44px] w-full rounded-lg border border-gray-300 px-2.5 text-base"
      />
      <button
        type="button"
        disabled={pending || !name.trim()}
        onClick={() => start(async () => {
          const saved = await onBeforeSave()
          if (!saved) return
          const r = await safeCall(() => saveRequisitionAsTemplate(requisitionId, name))
          if (!r.success) { toast.error(r.error); return }
          toast.success(`"${name}" saved`, {
            description: 'It will be offered the next time you start a requisition.',
          })
          setOpen(false); setName('')
        })}
        className="min-h-[44px] w-full rounded-xl bg-forest-700 text-sm font-semibold text-white disabled:opacity-50"
      >
        {pending ? 'Saving…' : 'Save template'}
      </button>
      <p className="text-[11px] text-gray-500">
        Items added after the order went out are left off — those were one-offs, and carrying
        them into the standing list is how templates go stale.
      </p>
    </div>
  )
}
