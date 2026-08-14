'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { CheckCircle2, Send, AlertCircle, Ban, Printer } from 'lucide-react'
import { toast } from '@/lib/toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { approveRequisition, submitRequisition, cancelRequisition } from '@/lib/actions/kitchen'
import { safeCall } from '@/lib/actions/safe-call'
import type { RequisitionStatus } from '@/lib/supabase/types-kitchen'
import type { SalesEmployee } from '@/lib/supabase/types'

/**
 * Approval is the gate before anything reaches a supplier. The paper form is
 * signed by a named person, so we record the employee as well as the login
 * that clicked — those can differ when a manager approves from someone else's
 * screen in the kitchen.
 */
export function ApprovePanel({
  requisitionId, status, employees, approverName, canWrite,
}: {
  requisitionId: string
  status: RequisitionStatus
  employees: Pick<SalesEmployee, 'id' | 'full_name'>[]
  approverName: string | null
  canWrite: boolean
}) {
  const router = useRouter()
  const confirm = useConfirm()
  const [pending, start] = useTransition()
  const [employeeId, setEmployeeId] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [cancelReason, setCancelReason] = useState('')

  if (!canWrite) return null

  if (status === 'cancelled') {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        This requisition is cancelled.
      </div>
    )
  }

  if (status === 'approved') {
    return (
      <div className="space-y-3">
        <div className="rounded-xl border border-green-300 bg-green-50 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-green-900">
            <CheckCircle2 size={16} /> Approved{approverName ? ` by ${approverName}` : ''}
          </p>
        </div>
        <Link
          href={`/kitchen/requisitions/${requisitionId}/dispatch`}
          className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-[#25D366] text-base font-semibold text-white"
        >
          <Send size={17} /> Send to suppliers
        </Link>
        <Link
          href={`/kitchen/requisitions/${requisitionId}/print`}
          className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-gray-300 bg-white text-sm font-semibold text-gray-700"
        >
          <Printer size={15} /> Print the sheet
        </Link>
      </div>
    )
  }

  if (status === 'draft') {
    return (
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
        <p className="text-sm text-gray-600">Still a draft — finish it and send for approval.</p>
        <button
          type="button"
          onClick={() => start(async () => {
            const r = await safeCall(() => submitRequisition(requisitionId))
            if (!r.success) { setError(r.error); return }
            toast.success('Sent for approval', { description: 'Here is the sheet to print.' })
            router.push(`/kitchen/requisitions/${requisitionId}/print`)
          })}
          disabled={pending}
          className="mt-3 flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-xl bg-forest-700 text-sm font-semibold text-white disabled:opacity-60"
        >
          <Send size={15} /> Send for approval
        </button>
        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      </div>
    )
  }

  // pending_approval
  return (
    <div className="space-y-3 rounded-xl border border-amber-300 bg-amber-50/60 p-4">
      <p className="text-sm font-semibold text-amber-900">Awaiting approval</p>

      <Link
        href={`/kitchen/requisitions/${requisitionId}/print`}
        className="flex min-h-[42px] w-full items-center justify-center gap-2 rounded-lg border border-amber-300 bg-white text-xs font-semibold text-amber-900"
      >
        <Printer size={14} /> Print the sheet
      </Link>

      <label className="block">
        <span className="mb-1 block text-xs font-medium text-gray-700">Approved by</span>
        <select
          value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}
          className="min-h-[44px] w-full rounded-lg border border-gray-300 bg-white px-2.5 text-sm"
        >
          <option value="">— choose a person —</option>
          {employees.map((e) => <option key={e.id} value={e.id}>{e.full_name}</option>)}
        </select>
      </label>

      <label className="block">
        <span className="mb-1 block text-xs font-medium text-gray-700">Notes (optional)</span>
        <textarea
          rows={2} value={notes} onChange={(e) => setNotes(e.target.value)}
          className="w-full rounded-lg border border-gray-300 px-2.5 py-2 text-sm"
        />
      </label>

      {error && (
        <p className="flex items-start gap-1.5 rounded-lg border border-red-200 bg-red-50 px-2.5 py-2 text-xs text-red-700">
          <AlertCircle size={13} className="mt-0.5 flex-shrink-0" />{error}
        </p>
      )}

      <button
        type="button"
        onClick={() => start(async () => {
          setError(null)
          const r = await safeCall(() => approveRequisition(requisitionId, {
            approved_by_employee_id: employeeId, approval_notes: notes || null,
          }))
          if (!r.success) { setError(r.error); return }
          toast.success('Requisition approved 🎉', { description: 'Now send it to the suppliers.' })
          router.refresh()
        })}
        disabled={pending || !employeeId}
        className="flex min-h-[48px] w-full items-center justify-center gap-1.5 rounded-xl bg-green-700 text-base font-semibold text-white disabled:opacity-50"
      >
        <CheckCircle2 size={17} /> {pending ? 'Approving…' : 'Approve'}
      </button>

      <button
        type="button"
        onClick={async () => {
          const ok = await confirm({
            title: 'Cancel this requisition?',
            description: 'It stays on record with the reason, but nothing gets ordered.',
            confirmLabel: 'Cancel it', danger: true,
          })
          if (!ok) return
          setCancelOpen(true)
        }}
        disabled={pending}
        className="flex min-h-[40px] w-full items-center justify-center gap-1.5 rounded-xl border border-red-200 text-xs font-medium text-red-600"
      >
        <Ban size={13} /> Cancel requisition
      </button>

      {cancelOpen && (
        <div className="space-y-2 rounded-lg border border-red-300 bg-white p-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-700">Reason</span>
            <input
              value={cancelReason} onChange={(e) => setCancelReason(e.target.value)}
              placeholder="e.g. event postponed"
              className="min-h-[42px] w-full rounded-lg border border-gray-300 px-2.5 text-sm"
            />
          </label>
          <div className="flex gap-2">
            <button type="button" onClick={() => setCancelOpen(false)}
              className="min-h-[40px] flex-1 rounded-lg border border-gray-300 text-xs font-medium text-gray-700">
              Keep it
            </button>
            <button
              type="button"
              disabled={pending || cancelReason.trim().length < 2}
              onClick={() => start(async () => {
                const r = await safeCall(() => cancelRequisition(requisitionId, cancelReason))
                if (!r.success) { setError(r.error); return }
                toast.success('Requisition cancelled')
                router.refresh()
              })}
              className="min-h-[40px] flex-1 rounded-lg bg-red-600 text-xs font-semibold text-white disabled:opacity-50"
            >
              Confirm cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
