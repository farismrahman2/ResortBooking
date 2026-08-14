'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { GitBranch, Unlock, ArrowRight } from 'lucide-react'
import { toast } from '@/lib/toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { createAmendment, reopenRequisition } from '@/lib/actions/kitchen'
import { safeCall } from '@/lib/actions/safe-call'
import { formatDateShort } from '@/lib/formatters/dates'
import { REQUISITION_STATUS_LABELS, REQUISITION_STATUS_BADGE } from '@/lib/supabase/types-kitchen'
import type { RequisitionWithLines } from '@/lib/supabase/types-kitchen'

/**
 * Changing an approved requisition.
 *
 * The fork is the dispatch line, and the panel is built around explaining it
 * rather than around the buttons:
 *
 *   nothing sent yet  → reopen and edit. Nobody has been told anything.
 *   already sent      → amend. Six WhatsApp groups hold the original and a
 *                       printed sheet is on a clipboard; a silent edit changes
 *                       none of those and erases what was authorised.
 *
 * People will reach for "just let me edit it", so when that path is closed the
 * panel says why in one sentence instead of greying a button out.
 */
export function AmendPanel({
  requisitionId, dispatchedCount, amendments, canWrite,
}: {
  requisitionId:   string
  dispatchedCount: number
  amendments:      RequisitionWithLines[]
  canWrite:        boolean
}) {
  const router = useRouter()
  const confirm = useConfirm()
  const [pending, start] = useTransition()

  const sent = dispatchedCount > 0

  return (
    <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-4">
      <p className="text-sm font-semibold text-gray-800">Need to change something?</p>

      {amendments.length > 0 && (
        <ul className="space-y-1.5">
          {amendments.map((a) => (
            <li key={a.id}>
              <Link
                href={`/kitchen/requisitions/${a.id}`}
                className="flex min-h-[44px] items-center gap-2 rounded-lg border border-gray-200 px-3 text-sm"
              >
                <GitBranch size={13} className="flex-shrink-0 text-gray-400" />
                <span className="min-w-0 flex-1 truncate">
                  {a.requisition_no}
                  <span className="ml-1.5 text-xs text-gray-500">
                    {a.lines.length} change{a.lines.length === 1 ? '' : 's'} · {formatDateShort(a.created_at.slice(0, 10))}
                  </span>
                </span>
                <span className={`flex-shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${REQUISITION_STATUS_BADGE[a.status]}`}>
                  {REQUISITION_STATUS_LABELS[a.status]}
                </span>
                <ArrowRight size={13} className="flex-shrink-0 text-gray-400" />
              </Link>
            </li>
          ))}
        </ul>
      )}

      {!canWrite ? null : sent ? (
        <>
          <button
            type="button"
            disabled={pending}
            onClick={() => start(async () => {
              const r = await safeCall(() => createAmendment(requisitionId))
              if (!r.success) { toast.error(r.error); return }
              router.push(`/kitchen/requisitions/${r.data.id}/edit`)
            })}
            className="flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl bg-amber-600 text-sm font-semibold text-white disabled:opacity-50"
          >
            <GitBranch size={15} /> {pending ? 'Starting…' : 'Raise an amendment'}
          </button>
          <p className="text-[11px] leading-relaxed text-gray-600">
            This order has already gone to {dispatchedCount} supplier
            {dispatchedCount === 1 ? '' : 's'}, so it can&apos;t be edited — they&apos;re holding the
            original. An amendment records only what changed, gets approved on its own, and
            goes out as a short &ldquo;add this, cancel that&rdquo; message to the suppliers it
            affects.
          </p>
        </>
      ) : (
        <>
          <button
            type="button"
            disabled={pending}
            onClick={async () => {
              const ok = await confirm({
                title: 'Reopen for editing?',
                description: 'The approval is cleared and it goes back to the approver’s queue.',
                confirmLabel: 'Reopen',
              })
              if (!ok) return
              start(async () => {
                const r = await safeCall(() => reopenRequisition(requisitionId))
                if (!r.success) { toast.error(r.error); return }
                toast.success('Reopened — it needs approving again')
                router.refresh()
              })
            }}
            className="flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl border border-gray-300 bg-white text-sm font-semibold text-gray-700 disabled:opacity-50"
          >
            <Unlock size={15} /> {pending ? 'Reopening…' : 'Reopen for editing'}
          </button>
          <p className="text-[11px] leading-relaxed text-gray-600">
            Nothing has been sent to a supplier yet, so this can still be changed properly.
            It goes back for approval afterwards — once a message goes out, only an
            amendment is possible.
          </p>
        </>
      )}
    </div>
  )
}
