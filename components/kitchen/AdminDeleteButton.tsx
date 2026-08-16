'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { toast } from '@/lib/toast'
import { safeCall } from '@/lib/actions/safe-call'
import {
  deleteRequisitionPermanently,
  deleteDeliveryPermanently,
  deletePaymentPermanently,
} from '@/lib/actions/kitchen-admin'

const ACTIONS = {
  requisition: { run: deleteRequisitionPermanently, listUrl: '/kitchen/requisitions' },
  delivery:    { run: deleteDeliveryPermanently,    listUrl: '/kitchen/deliveries' },
  payment:     { run: deletePaymentPermanently,     listUrl: '/kitchen/payments' },
} as const

/**
 * Permanent deletion, rendered only for admins — for sweeping test entries
 * out of the pipeline. Everything else in the module cancels (keeping the
 * paper trail); this genuinely erases, so it asks the admin to type the
 * record number back before it will fire.
 */
export function AdminDeleteButton({
  kind, id, recordNo,
}: {
  kind:     keyof typeof ACTIONS
  id:       string
  recordNo: string
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState('')

  if (!open) {
    return (
      <button
        type="button" onClick={() => setOpen(true)}
        className="flex min-h-[40px] w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-red-300 text-xs font-medium text-red-500"
      >
        <Trash2 size={13} /> Delete permanently (admin)
      </button>
    )
  }

  const matches = typed.trim().toUpperCase() === recordNo.toUpperCase()

  return (
    <div className="space-y-2 rounded-xl border border-red-400 bg-red-50/50 p-3">
      <p className="text-xs text-red-900">
        This erases <strong>{recordNo}</strong> completely — lines, photos, and (for a payment)
        its expense entry. There is no undo. Type <strong>{recordNo}</strong> to confirm.
      </p>
      <input
        value={typed} onChange={(e) => setTyped(e.target.value)}
        placeholder={recordNo} autoFocus
        className="min-h-[42px] w-full rounded-lg border border-red-300 px-2.5 font-mono text-sm"
      />
      <div className="flex gap-2">
        <button
          type="button" onClick={() => { setOpen(false); setTyped('') }}
          className="min-h-[40px] flex-1 rounded-lg border border-gray-300 bg-white text-xs font-medium text-gray-700"
        >
          Keep it
        </button>
        <button
          type="button"
          disabled={pending || !matches}
          onClick={() => start(async () => {
            const r = await safeCall(() => ACTIONS[kind].run(id))
            if (!r.success) { toast.error(r.error); return }
            toast.success(`${recordNo} deleted`)
            router.push(ACTIONS[kind].listUrl)
          })}
          className="min-h-[40px] flex-1 rounded-lg bg-red-600 text-xs font-semibold text-white disabled:opacity-40"
        >
          {pending ? 'Deleting…' : 'Delete forever'}
        </button>
      </div>
    </div>
  )
}
