'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, AlertTriangle, Ban, Trash2 } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { voidFieldVisit, hardDeleteFieldVisit } from '@/lib/actions/field-visits'
import { toast } from '@/lib/toast'

/**
 * Void = reversible-ish soft delete, keeps the record and its reason.
 * Delete = admin-only, destroys the visit and its photos permanently.
 *
 * Ordinary users can only void on the day the visit was logged; an admin has
 * no window and can also void an already-processed visit.
 */
export function VisitDangerZone({
  visitId, visitRef, status, organisationName, isAdmin, accountId,
}: {
  visitId:          string
  visitRef:         string
  status:           string
  organisationName: string | null
  isAdmin:          boolean
  accountId:        string | null
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [voidOpen, setVoidOpen]     = useState(false)
  const [reason, setReason]         = useState('')
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [confirmRef, setConfirmRef] = useState('')

  const alreadyVoid = status === 'void'
  const refMatches  = confirmRef.trim().toUpperCase() === visitRef.trim().toUpperCase()

  function handleVoid() {
    setError(null)
    startTransition(async () => {
      const r = await voidFieldVisit(visitId, reason)
      if (!r.success) { setError(r.error); return }
      setVoidOpen(false)
      toast.success(`${visitRef} voided`)
      router.refresh()
    })
  }

  function handleDelete() {
    setError(null)
    startTransition(async () => {
      const r = await hardDeleteFieldVisit(visitId, confirmRef)
      if (!r.success) { setError(r.error); return }
      toast.success(`${r.data.visit_ref} permanently deleted`)
      router.push('/crm/field-visits')
      router.refresh()
    })
  }

  return (
    <div className="rounded-xl border border-red-200 bg-red-50/40 p-4">
      <h3 className="text-sm font-semibold text-red-900">Danger zone</h3>
      <p className="mt-1 text-xs text-red-700/80">
        Voiding keeps the record and its reason, and hides it from the list.
        {isAdmin && ' Deleting destroys the visit and its card photos forever.'}
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        {!alreadyVoid && (
          <Button variant="outline" size="md" onClick={() => { setReason(''); setError(null); setVoidOpen(true) }}>
            <Ban size={14} /> Void visit
          </Button>
        )}
        {isAdmin && (
          <Button variant="danger" size="md" onClick={() => { setConfirmRef(''); setError(null); setDeleteOpen(true) }}>
            <Trash2 size={14} /> Delete Permanently
          </Button>
        )}
      </div>

      {error && !voidOpen && !deleteOpen && (
        <div className="mt-2 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Void */}
      <Modal open={voidOpen} onClose={() => setVoidOpen(false)} title={`Void ${visitRef}?`} size="sm">
        <div className="space-y-3">
          <p className="text-sm text-gray-700">
            The visit stays on record with the reason below, but drops out of the
            default list and can no longer be edited or processed.
          </p>
          {status === 'processed' && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
              <span>
                This visit was already processed into the CRM. The account and the
                logged activity it created are <strong>kept</strong> — only this
                visit record is voided.
              </span>
            </div>
          )}
          <Textarea
            label="Reason"
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Logged against the wrong organisation"
          />
          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}
          <div className="flex justify-end gap-2 border-t border-gray-100 pt-3">
            <Button variant="outline" size="md" onClick={() => setVoidOpen(false)}>Cancel</Button>
            <Button variant="danger" size="md" loading={pending} disabled={reason.trim().length < 2} onClick={handleVoid}>
              Void visit
            </Button>
          </div>
        </div>
      </Modal>

      {/* Hard delete — type-to-confirm, mirroring the CRM account danger zone */}
      <Modal open={deleteOpen} onClose={() => setDeleteOpen(false)} title={`Permanently delete ${visitRef}?`} size="sm">
        <div className="space-y-3">
          <p className="text-sm text-gray-700">
            This <strong>CANNOT</strong> be undone. The visit
            {organisationName ? <> for <strong>{organisationName}</strong></> : null},
            its contacts, venue history and visiting-card photos are destroyed.
          </p>
          {accountId && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <p className="flex items-start gap-1.5 font-medium">
                <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
                This visit was processed into the CRM.
              </p>
              <p className="mt-1">
                The CRM account and the logged activity are <strong>NOT</strong> deleted —
                they belong to the sales record now, and the KPI figures are counted from
                them. Only this visit is removed.
              </p>
            </div>
          )}
          <Input
            label={`To confirm, type ${visitRef} exactly:`}
            placeholder={visitRef}
            value={confirmRef}
            onChange={(e) => setConfirmRef(e.target.value)}
            autoComplete="off"
          />
          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}
          <div className="flex justify-end gap-2 border-t border-gray-100 pt-3">
            <Button variant="outline" size="md" onClick={() => setDeleteOpen(false)}>Cancel</Button>
            <Button variant="danger" size="md" loading={pending} disabled={!refMatches} onClick={handleDelete}>
              Delete permanently
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
