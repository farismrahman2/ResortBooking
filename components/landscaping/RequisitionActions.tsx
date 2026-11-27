'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { BadgeCheck, Check, CheckCheck, FileDown, Pencil, Send, Trash2, Undo2, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Textarea } from '@/components/ui/Textarea'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { advanceRequisition, cancelRequisition, deleteRequisition, rejectRequisition, selfApproveRequisition, submitRequisition } from '@/lib/actions/landscaping'
import { canActOnRequisition, canSelfApprove, deleteRule, editRule, formatReqNo } from '@/lib/landscaping/money'
import { Input } from '@/components/ui/Input'
import { formatBDT } from '@/lib/formatters/currency'
import { safeCall } from '@/lib/actions/safe-call'
import { toast } from '@/lib/toast'
import type { LsMe } from '@/lib/queries/landscaping'
import type { ActionResult } from '@/lib/actions/types'
import { cn } from '@/lib/utils'
import { TAP } from './ui'

/** What this person may do with this requisition right now. */
export function RequisitionActions({ req, me, hasBills }: {
  req: { id: string; req_no: number; total: number; status: string; prepared_by: string | null; checked_by: string | null; paper_approved_by?: string | null }
  me: LsMe
  hasBills: boolean
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [busy, setBusy] = useState<string | null>(null)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [note, setNote] = useState('')
  const [approveOpen, setApproveOpen] = useState(false)
  const [approverName, setApproverName] = useState(req.paper_approved_by || me.name)
  const confirm = useConfirm()

  const run = (key: string, fn: () => Promise<ActionResult>, done: string) => {
    setBusy(key)
    start(async () => {
      const r = await safeCall(fn)
      setBusy(null)
      if (!r.success) { toast.error(r.error); return }
      toast.success(done); setRejectOpen(false); setApproveOpen(false); setNote('')
      if (key === 'delete' || key === 'cancel') { router.push('/landscaping/requisitions'); return }
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
  // Approver/admin on their own requisition: approve in one step (the normal check → approve still applies to others').
  const canApproveSelf = mine && canSelfApprove(req.status, me).ok
  const canDelete = deleteRule(req.status, hasBills, mine, me.is_admin).ok
  const canCancel = !hasBills && !['cancelled'].includes(req.status) && (mine || me.is_admin) && req.status !== 'approved'

  const outline = cn(TAP, 'inline-flex items-center justify-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-50')
  const primary = cn(TAP, 'w-full gap-1.5 sm:w-auto')
  const quiet = cn(TAP, 'gap-1.5 px-3')
  const hasMain = canSend || canCheck || canApprove || canApproveSelf

  // Phone: the main step full width on top, everyday buttons side by side,
  // and Cancel / Delete last as quiet text. Computer: one row, risky ones on the right.
  return (
    <div className="space-y-2 sm:flex sm:flex-wrap sm:items-center sm:gap-2 sm:space-y-0">
      {hasMain && (
        <div className="grid gap-2 sm:contents">
          {canSend && (
            <Button size="md" variant="primary" className={primary} loading={pending && busy === 'submit'}
              onClick={() => run('submit', () => submitRequisition(req.id), 'Sent for checking')}>
              <Send size={15} /> Send for checking
            </Button>
          )}
          {canCheck && (
            <Button size="md" variant="primary" className={primary} loading={pending && busy === 'check'}
              onClick={() => run('check', () => advanceRequisition(req.id, 'check'), 'Checked — now waiting for approval')}>
              <Check size={15} /> Mark checked
            </Button>
          )}
          {canApprove && (
            <Button size="md" variant="primary" className={primary} loading={pending && busy === 'approve'}
              onClick={async () => {
                if (!(await confirm({ title: `Approve ${label}?`, description: 'Once approved it can no longer be edited, and items can be ordered against it.', confirmLabel: 'Approve' }))) return
                run('approve', () => advanceRequisition(req.id, 'approve'), 'Approved — items can be ordered')
              }}>
              <CheckCheck size={15} /> Approve
            </Button>
          )}
          {canApproveSelf && (
            <Button size="md" variant="primary" className={primary} onClick={() => setApproveOpen(true)}>
              <BadgeCheck size={15} /> Approve myself
            </Button>
          )}
        </div>
      )}
      <div className="flex gap-2 [&>*]:flex-1 sm:contents sm:[&>*]:flex-none">
        {canReject && (
          <Button size="md" variant="outline" className={cn(TAP, 'gap-1.5')} onClick={() => setRejectOpen(true)}>
            <Undo2 size={14} /> Send back
          </Button>
        )}
        {canEdit && (
          <Link href={`/landscaping/requisitions/${req.id}/edit`} className={outline}>
            <Pencil size={14} /> Edit
          </Link>
        )}
        <a href={`/api/landscaping/requisitions/${req.id}/pdf`} target="_blank" rel="noopener" className={outline}>
          <FileDown size={14} /> Slip PDF
        </a>
      </div>
      {(canCancel || canDelete) && (
        <div className="flex flex-wrap gap-1 border-t border-gray-100 pt-1 sm:contents">
          {canCancel && (
            <Button size="md" variant="ghost" className={cn(quiet, 'text-gray-600 sm:ml-auto')} loading={pending && busy === 'cancel'}
              onClick={async () => {
                if (!(await confirm({ title: `Cancel ${label}?`, description: 'It is removed and its number becomes free again (the Audit Log keeps a note).', confirmLabel: 'Cancel requisition', danger: true }))) return
                run('cancel', () => cancelRequisition(req.id), 'Requisition cancelled — its number is free again')
              }}>
              <X size={14} /> Cancel requisition
            </Button>
          )}
          {canDelete && (
            <Button size="md" variant="ghost" className={cn(quiet, 'text-red-700 hover:bg-red-50', !canCancel && 'sm:ml-auto')} loading={pending && busy === 'delete'}
              onClick={async () => {
                if (!(await confirm({ title: `Delete ${label}?`, description: 'It is removed for good (the Audit Log keeps a note). To keep the record, use Cancel instead.', confirmLabel: 'Delete', danger: true }))) return
                run('delete', () => deleteRequisition(req.id), 'Requisition deleted')
              }}>
              <Trash2 size={14} /> Delete
            </Button>
          )}
        </div>
      )}
      <Modal open={approveOpen} onClose={() => setApproveOpen(false)} title={`Approve ${label}`}
        footer={<><Button variant="outline" size="md" className={TAP} onClick={() => setApproveOpen(false)}>Close</Button>
          <Button variant="primary" size="md" className={TAP} loading={pending && busy === 'self'} disabled={!approverName.trim()}
            onClick={() => run('self', () => selfApproveRequisition(req.id, approverName), 'Approved')}>Approve</Button></>}>
        <div className="space-y-3">
          <p className="text-sm text-gray-600">You prepared this one. Approving it yourself skips checking; it is marked <b>Self-approved</b> and the admin sees it in the Audit Log.</p>
          <Input label="Approved by (printed on the slip)" value={approverName} onChange={(e) => setApproverName(e.target.value)} />
        </div>
      </Modal>
      <Modal open={rejectOpen} onClose={() => setRejectOpen(false)} title="Send back for changes">
        <div className="space-y-3">
          <Textarea label="What needs changing? (required)" value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="md" className={TAP} onClick={() => setRejectOpen(false)}>Close</Button>
            <Button variant="danger" size="md" className={TAP} loading={pending && busy === 'reject'}
              disabled={!note.trim()} onClick={() => run('reject', () => rejectRequisition(req.id, note), 'Sent back')}>Send back</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
