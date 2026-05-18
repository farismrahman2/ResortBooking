'use client'

import Link from 'next/link'
import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Phone, ExternalLink, AlertTriangle, AlertCircle, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { StatusBadge } from '@/components/ui/Badge'
import { cancelBooking } from '@/lib/actions/bookings'
import { formatBDT } from '@/lib/formatters/currency'
import { formatDate } from '@/lib/formatters/dates'
import { cn } from '@/lib/utils'
import type { DuplicateGroup } from '@/lib/queries/duplicate-bookings'

interface Props {
  groups:   DuplicateGroup[]
  canWrite: boolean
}

const CHECKOUT_STATUS_LABEL: Record<string, string> = {
  draft:     'Draft checkout',
  finalized: 'Checked out',
  voided:    'Voided',
}

export function DuplicateBookingsTable({ groups, canWrite }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  function handleCancel(id: string, number: string, isLikelyDupe: boolean) {
    const msg = isLikelyDupe
      ? `Cancel ${number}? This is the suggested duplicate (no activity / created later). Cancellation can be undone via SQL if needed.`
      : `Cancel ${number}? This booking has activity attached (charges, payments, or checkout). Make sure you really want to cancel.`
    if (!confirm(msg)) return
    startTransition(async () => {
      const r = await cancelBooking(id)
      if (!r.success) { alert(r.error); return }
      router.refresh()
    })
  }

  if (groups.length === 0) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-6 text-center">
        <p className="text-sm font-semibold text-emerald-900">No duplicate bookings found.</p>
        <p className="mt-1 text-xs text-emerald-700">
          Every active booking has a unique (phone, date, package type) combination.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-xs text-amber-900">
        <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
        <span>
          Found <strong>{groups.length}</strong> group{groups.length === 1 ? '' : 's'} of bookings sharing the
          same guest phone, visit date, and package type. The row highlighted in <strong className="text-rose-700">rose</strong>{' '}
          is the suggested duplicate (no activity, or created later than a sibling). Some may be intentional
          (corporate group splits) — review each one before cancelling.
        </span>
      </div>

      {groups.map((g) => (
        <div key={g.key} className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <div className="border-b border-gray-200 bg-gray-50 px-4 py-2.5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-gray-900">{g.customer_name}</p>
                <p className="text-xs text-gray-500 inline-flex items-center gap-1.5">
                  <Phone size={11} /> {g.customer_phone}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-500">
                  {formatDate(g.visit_date)} · <span className="capitalize">{g.package_type}</span>
                </p>
                <p className="text-[10px] text-rose-700 font-semibold">
                  {g.bookings.length} bookings
                </p>
              </div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[820px]">
              <thead className="border-b border-gray-100">
                <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
                  <th className="px-3 py-2 font-medium">Booking</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 text-right font-medium">Total</th>
                  <th className="px-3 py-2 font-medium">Activity</th>
                  <th className="px-3 py-2 font-medium">Created</th>
                  <th className="px-3 py-2 text-right" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {g.bookings.map((b) => {
                  const locked = b.status === 'checked_out'
                  const hasActivity = b.charges_count > 0 || b.payments_count > 0 || b.checkout_status !== null
                  return (
                    <tr
                      key={b.id}
                      className={cn(
                        b.is_likely_dupe ? 'bg-rose-50/40' : '',
                        hasActivity && !b.is_likely_dupe ? 'bg-emerald-50/30' : '',
                      )}
                    >
                      <td className="px-3 py-2 font-mono text-xs">
                        <Link
                          href={`/bookings/${b.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-violet-700 hover:underline"
                        >
                          {b.booking_number}
                          <ExternalLink size={10} />
                        </Link>
                        {b.is_likely_dupe && (
                          <span className="ml-1.5 inline-flex items-center gap-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-200 px-1.5 py-0.5 text-[9px] font-semibold uppercase">
                            <AlertCircle size={9} /> Likely dupe
                          </span>
                        )}
                        {hasActivity && !b.is_likely_dupe && (
                          <span className="ml-1.5 inline-flex items-center gap-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 px-1.5 py-0.5 text-[9px] font-semibold uppercase">
                            <CheckCircle2 size={9} /> In use
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2"><StatusBadge status={b.status} /></td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">{formatBDT(b.total)}</td>
                      <td className="px-3 py-2 text-xs text-gray-600">
                        {hasActivity ? (
                          <div className="space-y-0.5">
                            {b.checkout_status && (
                              <p className="font-medium text-gray-700">{CHECKOUT_STATUS_LABEL[b.checkout_status]}</p>
                            )}
                            {b.charges_count > 0 && (
                              <p>{b.charges_count} charge{b.charges_count === 1 ? '' : 's'}</p>
                            )}
                            {b.payments_count > 0 && (
                              <p>{b.payments_count} payment{b.payments_count === 1 ? '' : 's'}</p>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-400 italic">none</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-500 whitespace-nowrap">
                        {formatDate(b.created_at.slice(0, 10))}
                        <p className="text-[10px] text-gray-400 font-mono">
                          {new Date(b.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </td>
                      <td className="px-3 py-2 text-right">
                        {canWrite && !locked ? (
                          <Button
                            type="button"
                            variant={b.is_likely_dupe ? 'danger' : 'outline'}
                            size="sm"
                            disabled={pending}
                            onClick={() => handleCancel(b.id, b.booking_number, b.is_likely_dupe)}
                            title={b.is_likely_dupe
                              ? 'Suggested cancel — no activity or created later'
                              : 'Has activity — confirm before cancelling'}
                          >
                            Cancel
                          </Button>
                        ) : locked ? (
                          <span className="text-[10px] text-gray-400 italic">checked out — cannot cancel</span>
                        ) : null}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  )
}
