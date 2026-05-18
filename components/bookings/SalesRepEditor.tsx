'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, UserCircle2, AlertCircle } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { setBookingSalesRep } from '@/lib/actions/bookings'
import type { SalesEmployee } from '@/lib/supabase/types'

interface Props {
  bookingId:     string
  /** Current rep — null when unattributed */
  current:       SalesEmployee | null
  /** All sales-eligible employees */
  options:       SalesEmployee[]
  /** Caller decides whether the user can edit (e.g. bookings:write) */
  canEdit?:      boolean
}

export function SalesRepEditor({ bookingId, current, options, canEdit }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [pickedId, setPickedId] = useState<string>(current?.id ?? '')

  function close() {
    setError(null)
    setPickedId(current?.id ?? '')
    setOpen(false)
  }

  function save() {
    setError(null)
    startTransition(async () => {
      const r = await setBookingSalesRep(bookingId, pickedId || null)
      if (!r.success) { setError(r.error); return }
      setOpen(false)
      router.refresh()
    })
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3 space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[10px] uppercase tracking-wider font-semibold text-gray-500 inline-flex items-center gap-1">
          <UserCircle2 size={11} /> Sales Rep
        </span>
        {canEdit && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
            title="Re-assign sales rep"
          >
            <Pencil size={12} />
          </button>
        )}
      </div>
      {current ? (
        <div>
          <p className="text-sm font-medium text-gray-900">{current.full_name}</p>
          <p className="text-xs text-gray-500">
            {current.employee_code}
            {current.sales_team ? ` · ${current.sales_team}` : ''}
          </p>
        </div>
      ) : (
        <p className="text-xs italic text-gray-400">Unassigned</p>
      )}

      <Modal open={open} onClose={close} title="Re-assign Sales Rep">
        <div className="space-y-3">
          <Select
            label="Sales rep"
            value={pickedId}
            onChange={(e) => setPickedId(e.target.value)}
          >
            <option value="">— No rep assigned —</option>
            {options.map((s) => (
              <option key={s.id} value={s.id}>
                {s.full_name}
                {s.sales_team ? ` · ${s.sales_team}` : ''}
                {' '}
                ({s.employee_code})
              </option>
            ))}
          </Select>
          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" size="md" onClick={close}>Cancel</Button>
            <Button type="button" variant="primary" size="md" loading={pending} onClick={save}>
              Save
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
