'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Check, CheckCheck, FileDown, Pencil, Send, Undo2, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Textarea } from '@/components/ui/Textarea'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { advanceRequisition, cancelRequisition, rejectRequisition, submitRequisition } from '@/lib/actions/landscaping'
import { canActOnRequisition, editRule, formatReqNo } from '@/lib/landscaping/money'
import { formatBDT } from '@/lib/formatters/currency'
import { safeCall } from '@/lib/actions/safe-call'
import { toast } from '@/lib/toast'
import type { LsMe } from '@/lib/queries/landscaping'
import type { ActionResult } from '@/lib/actions/types'

/** What this person may do with this requisition right now. */
export function RequisitionActions({ req, me, hasBills }: {
  req: { id: string; req_no: number; total: number; status: string; prepared_by: string | null; checked_by: string | null }
  me: LsMe
  hasBills: boolean
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [busy, setBusy] = useState<string | null>(null)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [note, setNote] = useState('')
  const confirm = useConfirm()

  const run = (key: string, fn: () => Promise<ActionResult>, done: string) => {
    setBusy(key)
    start(async () => {
      const r = await safeCall(fn)
      setBusy(null)
      if (!r.success) { toast.error(r.error); return }
      toast.success(done); setRejectOpen(false); setNote('')
      router.refresh()
    })
  }

  const mine = req.prepared_by === me.user_id
  const canEdit = editRule(req.status, mine, me.is_admin).ok
  const canSend = ['draft', 'rejected'].includes(req.status) && (mine || me.is_admin)
  const label = `Req ${formatReqNo(req.req_no)} · ${formatBDT(req.total)}`
  const canCheck = canActOnRequisition('check', req, me).ok
  const canApprove = canActOnRequisition('approve', req, me).ok
  const canReject = ['submitted', 'checked'].includes(req.status) && (!mine || me.is_admin) && (me.can_check || me.can_approve || me.is_admin)
  const canCancel = !hasBills && !['cancelled'].includes(req.status) && (mine || me.is_admin) && req.status !== 'approved'

  return (
    <div className="flex flex-wrap gap-2">
      <a href={`/api/landscaping/requisitions/${req.id}/pdf`} target="_blank" rel="noopener"
        className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700 hover:bg-gray-50">
        <FileDown size={14} /> Slip PDF
      </a>
      {canEdit && (
        <Link href={`/landscaping/requisitions/${req.id}/edit`}
          className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700 hover:bg-gray-50">
          <Pencil size={14} /> Edit
        </Link>
      )}
      {canSend && (
        <Button size="md" variant="primary" className="gap-1.5" loading={pending && busy === 'submit'}
          onClick={() => run('submit', () => submitRequisition(req.id), 'Sent for checking')}>
          <Send size={14} /> Send for checking
        </Button>
      )}
      {canCheck && (
        <Button size="md" variant="primary" className="gap-1.5" loading={pending && busy === 'check'}
          onClick={() => run('check', () => advanceRequisition(req.id, 'check'), 'Checked — now waiting for approval')}>
          <Check size={14} /> Mark checked
        </Button>
      )}
      {canApprove && (
        <Button size="md" variant="primary" className="gap-1.5" loading={pending && busy === 'approve'}
          onClick={async () => {
            if (!(await confirm({ title: `Approve ${label}?`, description: 'Once approved it can no longer be edited, and items can be ordered against it.', confirmLabel: 'Approve' }))) return
            run('approve', () => advanceRequisition(req.id, 'approve'), 'Approved — items can be ordered')
          }}>
          <CheckCheck size={14} /> Approve
        </Button>
      )}
      {canReject && (
        <Button size="md" variant="outline" className="gap-1.5" onClick={() => setRejectOpen(true)}>
          <Undo2 size={14} /> Send back
        </Button>
      )}
      {canCancel && (
        <Button size="md" variant="outline" className="gap-1.5" loading={pending && busy === 'cancel'}
          onClick={async () => {
            if (!(await confirm({ title: `Cancel ${label}?`, description: 'It stays on record as cancelled and cannot be used for bills.', confirmLabel: 'Cancel requisition', danger: true }))) return
            run('cancel', () => cancelRequisition(req.id), 'Requisition cancelled')
          }}>
          <X size={14} /> Cancel
        </Button>
      )}
      <Modal open={rejectOpen} onClose={() => setRejectOpen(false)} title="Send back for changes">
        <div className="space-y-3">
          <Textarea label="What needs changing? (required)" value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="md" onClick={() => setRejectOpen(false)}>Close</Button>
            <Button variant="danger" size="md" loading={pending && busy === 'reject'}
              disabled={!note.trim()} onClick={() => run('reject', () => rejectRequisition(req.id, note), 'Sent back')}>Send back</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
