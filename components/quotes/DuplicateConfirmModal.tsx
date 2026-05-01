'use client'

import Link from 'next/link'
import { AlertTriangle, ExternalLink } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { StatusBadge } from '@/components/ui/Badge'
import { formatBDT } from '@/lib/formatters/currency'
import { formatDate } from '@/lib/formatters/dates'
import type { DuplicateMatch } from '@/lib/queries/duplicate-bookings'

interface Props {
  open:       boolean
  existing:   DuplicateMatch[]
  /** What we're trying to create — used for the headline copy */
  attempting: 'quote' | 'booking'
  onCancel:   () => void
  /** Re-runs the create action with allow_duplicate=true */
  onConfirm:  () => void
  pending?:   boolean
}

export function DuplicateConfirmModal({
  open, existing, attempting, onCancel, onConfirm, pending,
}: Props) {
  const noun = attempting === 'quote' ? 'quote' : 'booking'

  return (
    <Modal open={open} onClose={onCancel} title="Possible Duplicate Detected" size="lg">
      <div className="space-y-4">
        <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-xs text-amber-900">
          <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
          <span>
            {existing.length === 1
              ? <>An existing record was found for this guest on the same date. Are you sure you want to create another {noun}?</>
              : <>{existing.length} existing records were found for this guest on the same date. Are you sure you want to create another {noun}?</>}
          </span>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-200 bg-gray-50">
              <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="px-3 py-2 font-medium">#</th>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 text-right font-medium">Total</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {existing.map((m) => {
                const href = m.kind === 'booking' ? `/bookings/${m.id}` : `/quotes/${m.id}`
                const dateLabel = m.check_out_date
                  ? `${formatDate(m.visit_date)} → ${formatDate(m.check_out_date)}`
                  : `${formatDate(m.visit_date)} (Daylong)`
                return (
                  <tr key={`${m.kind}-${m.id}`}>
                    <td className="px-3 py-2 font-mono text-xs text-gray-700">{m.number}</td>
                    <td className="px-3 py-2 text-xs uppercase text-gray-500">{m.kind}</td>
                    <td className="px-3 py-2"><StatusBadge status={m.status} /></td>
                    <td className="px-3 py-2 text-xs text-gray-600">{dateLabel}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">{formatBDT(m.total)}</td>
                    <td className="px-3 py-2 text-right">
                      <Link
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-forest-700 hover:underline"
                      >
                        Open <ExternalLink size={11} />
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-gray-500">
          Sometimes this is intentional — e.g. a corporate group with multiple sub-bookings.
          Click <strong>Create anyway</strong> to proceed, or <strong>Cancel</strong> to review.
        </p>

        <div className="flex items-center justify-end gap-2 border-t border-gray-100 pt-3">
          <Button type="button" variant="outline" size="md" onClick={onCancel} disabled={pending}>
            Cancel
          </Button>
          <Button type="button" variant="secondary" size="md" loading={pending} onClick={onConfirm}>
            Create anyway
          </Button>
        </div>
      </div>
    </Modal>
  )
}
