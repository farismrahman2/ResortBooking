'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { AlertCircle, AlertTriangle, ArchiveRestore, Archive, Trash2 } from 'lucide-react'
import {
  deactivateAccount, reactivateAccount, hardDeleteAccount, getAccountDeleteImpactAction,
} from '@/lib/actions/crm'
import type { AccountDeleteImpact } from '@/lib/queries/crm'

interface Props {
  accountId:   string
  companyName: string
  isActive:    boolean
  isAdmin:     boolean
}

export function AccountDangerZone({ accountId, companyName, isActive, isAdmin }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  // Hard-delete modal state
  const [deleteOpen, setDeleteOpen]   = useState(false)
  const [impact, setImpact]           = useState<AccountDeleteImpact | null>(null)
  const [impactError, setImpactError] = useState<string | null>(null)
  const [confirmText, setConfirmText] = useState('')

  function handleDeactivate() {
    if (!window.confirm(`Deactivate ${companyName}? It will be hidden from active lists but can be reactivated later.`)) return
    setError(null)
    startTransition(async () => {
      const r = await deactivateAccount(accountId)
      if (!r.success) { setError(r.error); return }
      router.refresh()
    })
  }

  function handleReactivate() {
    setError(null)
    startTransition(async () => {
      const r = await reactivateAccount(accountId)
      if (!r.success) { setError(r.error); return }
      router.refresh()
    })
  }

  function openDeleteModal() {
    setConfirmText('')
    setImpact(null)
    setImpactError(null)
    setDeleteOpen(true)
    startTransition(async () => {
      const r = await getAccountDeleteImpactAction(accountId)
      if (!r.success) { setImpactError(r.error); return }
      setImpact(r.data)
    })
  }

  function handleHardDelete() {
    setError(null)
    startTransition(async () => {
      const r = await hardDeleteAccount(accountId, confirmText)
      if (!r.success) { setError(r.error); return }
      const unlinked = r.data.orphanedBookings
      window.alert(
        `‘${companyName}’ permanently deleted.` +
        (unlinked > 0 ? ` ${unlinked} booking${unlinked === 1 ? ' was' : 's were'} unlinked and preserved.` : ''),
      )
      router.push('/crm/accounts')
      router.refresh()
    })
  }

  const nameMatches = confirmText.trim() === companyName.trim()
  const isRisky = (impact?.wonOpportunitiesCount ?? 0) > 0 || (impact?.linkedBookings.length ?? 0) > 0

  return (
    <div className="rounded-xl border border-red-200 bg-red-50/40 p-4">
      <h3 className="text-sm font-semibold text-red-900">Danger zone</h3>
      <p className="mt-1 text-xs text-red-700/80">
        Deactivating hides the account but keeps all data and is reversible.
        {isAdmin && ' Permanent deletion destroys the account and its CRM history forever.'}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {isActive ? (
          <Button variant="outline" size="md" onClick={handleDeactivate} loading={pending && !deleteOpen}>
            <Archive size={14} /> Deactivate
          </Button>
        ) : (
          <Button variant="outline" size="md" onClick={handleReactivate} loading={pending && !deleteOpen}>
            <ArchiveRestore size={14} /> Reactivate
          </Button>
        )}
        {isAdmin && (
          <Button variant="danger" size="md" onClick={openDeleteModal}>
            <Trash2 size={14} /> Delete Permanently
          </Button>
        )}
      </div>

      {error && !deleteOpen && (
        <div className="mt-2 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Hard delete — type-to-confirm modal */}
      <Modal open={deleteOpen} onClose={() => setDeleteOpen(false)} title={`Permanently delete ${companyName}?`}>
        <div className="space-y-3">
          {impactError ? (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
              <span>{impactError}</span>
            </div>
          ) : !impact ? (
            <p className="py-4 text-center text-sm text-gray-500">Checking what this will destroy…</p>
          ) : (
            <>
              {isRisky && (
                <div className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-100 px-3 py-2 text-sm font-medium text-red-900">
                  <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
                  <span>
                    This is a client with real booking history. Consider <strong>Deactivating</strong> instead of deleting.
                  </span>
                </div>
              )}

              <p className="text-sm text-gray-700">
                This <strong>CANNOT</strong> be undone. The following will be destroyed forever:
              </p>
              <ul className="space-y-1 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-800">
                <li>• {impact.contactsCount} contact{impact.contactsCount === 1 ? '' : 's'}</li>
                <li>
                  • {impact.opportunitiesCount} opportunit{impact.opportunitiesCount === 1 ? 'y' : 'ies'}
                  {impact.wonOpportunitiesCount > 0 && (
                    <strong className="text-red-700"> ({impact.wonOpportunitiesCount} Won)</strong>
                  )}
                </li>
                <li>• {impact.activitiesCount} logged activit{impact.activitiesCount === 1 ? 'y' : 'ies'}</li>
              </ul>

              {impact.linkedBookings.length > 0 && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  <p className="flex items-start gap-1.5 font-medium">
                    <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
                    This account has {impact.linkedBookings.length} linked booking{impact.linkedBookings.length === 1 ? '' : 's'}:
                  </p>
                  <ul className="mt-1 space-y-0.5 pl-5">
                    {impact.linkedBookings.map((b) => (
                      <li key={b.id} className="font-mono text-xs">
                        {b.booking_number} <span className="font-sans text-amber-700">(status: {b.status})</span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1.5 text-xs">
                    These bookings will <strong>NOT</strong> be deleted — only their link to this account is removed.
                    The Reservations team keeps the booking.
                  </p>
                </div>
              )}

              <Input
                label="To confirm, type the company name exactly:"
                placeholder={companyName}
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                autoComplete="off"
              />

              {error && (
                <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" size="md" onClick={() => setDeleteOpen(false)}>Cancel</Button>
                {isRisky && (
                  <Button variant="secondary" size="md" onClick={() => { setDeleteOpen(false); handleDeactivate() }}>
                    Deactivate instead
                  </Button>
                )}
                <Button variant="danger" size="md" loading={pending} disabled={!nameMatches} onClick={handleHardDelete}>
                  <Trash2 size={14} /> Delete Permanently
                </Button>
              </div>
            </>
          )}
        </div>
      </Modal>
    </div>
  )
}
