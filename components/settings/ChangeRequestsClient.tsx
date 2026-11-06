'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Check, X, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { decideChangeRequest, type ChangeRequestRow } from '@/lib/actions/change-requests'
import { safeCall } from '@/lib/actions/safe-call'
import { toast } from '@/lib/toast/store'
import { formatBDT } from '@/lib/formatters/currency'
import { formatDate } from '@/lib/formatters/dates'

const KIND = { discount: 'Discount', cancel: 'Cancel booking', advance: 'Advance payment', other: 'Other change' } as const
const STATUS = {
  pending:  'bg-amber-50 text-amber-800 border-amber-200',
  approved: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  rejected: 'bg-red-50 text-red-700 border-red-200',
} as const

function what(r: ChangeRequestRow): string {
  if (r.kind === 'discount') return [r.details.discount ? `${formatBDT(r.details.discount)} off` : null, r.details.discount_pct ? `${r.details.discount_pct}% off` : null].filter(Boolean).join(' + ')
  if (r.kind === 'advance') return `${formatBDT(r.details.amount ?? 0)}${r.details.method ? ` via ${r.details.method.replace('_', ' ')}` : ''}`
  return ''
}

export function ChangeRequestsClient({ requests }: { requests: ChangeRequestRow[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [busy, setBusy] = useState<string | null>(null)
  const [notes, setNotes] = useState<Record<string, string>>({})

  function decide(r: ChangeRequestRow, approve: boolean) {
    setBusy(r.id + (approve ? ':y' : ':n'))
    start(async () => {
      const res = await safeCall(() => decideChangeRequest(r.id, approve, notes[r.id]))
      setBusy(null)
      if (!res.success) { toast.error(res.error); return }
      toast.success(!approve ? 'Rejected'
        : res.data.applied ? 'Approved and applied to the booking'
        : 'Approved — now record it on the booking')
      router.refresh()
    })
  }

  if (requests.length === 0) {
    return <p className="mx-auto max-w-3xl rounded-xl border border-gray-200 bg-white px-4 py-6 text-center text-sm text-gray-500">No change requests yet.</p>
  }

  return (
    <div className="mx-auto max-w-3xl space-y-3">
      {requests.map((r) => (
        <div key={r.id} className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${STATUS[r.status]}`}>{r.status}</span>
            <span className="text-sm font-semibold text-gray-900">{KIND[r.kind]}</span>
            {what(r) && <span className="text-sm text-gray-700">{what(r)}</span>}
            <span className="ml-auto text-xs text-gray-400">
              {r.requester_name ?? 'Someone'} · {new Date(r.created_at).toLocaleString('en-GB', { timeZone: 'Asia/Dhaka', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
          {r.booking && (
            <Link href={`/bookings/${r.booking_id}`} className="mt-1 inline-flex items-center gap-1 text-xs text-forest-700 hover:underline">
              {r.booking.booking_number} · {r.booking.customer_name} · {formatDate(r.booking.visit_date)} · total {formatBDT(Number(r.booking.total))}
              {Number(r.booking.discount) > 0 ? ` (discount now ${formatBDT(Number(r.booking.discount))})` : ''} <ExternalLink size={11} />
            </Link>
          )}
          {r.note && <p className="mt-2 rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700">{r.note}</p>}
          {r.status === 'pending' ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input value={notes[r.id] ?? ''} onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })}
                placeholder="Note for them (optional)"
                className="min-h-[36px] flex-1 rounded-lg border border-gray-300 px-3 text-sm focus:border-forest-600 focus:outline-none" />
              <Button variant="outline" size="sm" className="gap-1" loading={pending && busy === r.id + ':n'} onClick={() => decide(r, false)}>
                <X size={13} /> Reject
              </Button>
              <Button variant="primary" size="sm" className="gap-1" loading={pending && busy === r.id + ':y'} onClick={() => decide(r, true)}>
                <Check size={13} /> {r.kind === 'discount' ? 'Approve & apply' : r.kind === 'cancel' ? 'Approve & cancel booking' : 'Approve'}
              </Button>
            </div>
          ) : (
            r.decision_note && <p className="mt-2 text-xs text-gray-500">Your note: {r.decision_note}</p>
          )}
          {r.status === 'pending' && (r.kind === 'advance' || r.kind === 'other') && (
            <p className="mt-1.5 text-[11px] text-gray-500">Approving records your decision; then add the payment or change on the booking page.</p>
          )}
        </div>
      ))}
    </div>
  )
}
