'use client'

import { useState, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Check, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { acknowledgeAlert } from '@/lib/actions/checkout'
import { formatDate } from '@/lib/formatters/dates'
import { cn } from '@/lib/utils'
import type { AdminAlertEvent } from '@/lib/supabase/types'
import type { AdminAlertWithUser } from '@/lib/queries/admin-alerts'

interface Props {
  alerts: AdminAlertWithUser[]
  filter: 'unread' | 'all' | AdminAlertEvent
}

const FILTERS: Array<{ value: 'unread' | 'all' | AdminAlertEvent; label: string }> = [
  { value: 'unread',             label: 'Unread' },
  { value: 'all',                label: 'All' },
  { value: 'discount_applied',   label: 'Discounts' },
  { value: 'guest_reduced',      label: 'Guest reductions' },
  { value: 'checkout_voided',    label: 'Voids' },
  { value: 'refund_recorded',    label: 'Refunds' },
  { value: 'booking_cancelled',  label: 'Cancellations' },
  { value: 'user_deactivated',   label: 'Deactivations' },
]

const EVENT_BADGE: Record<AdminAlertEvent, string> = {
  discount_applied:  'bg-amber-50 text-amber-800 border-amber-200',
  guest_reduced:     'bg-orange-50 text-orange-800 border-orange-200',
  checkout_voided:   'bg-red-50 text-red-800 border-red-200',
  refund_recorded:   'bg-teal-50 text-teal-800 border-teal-200',
  booking_cancelled: 'bg-rose-50 text-rose-800 border-rose-200',
  booking_no_show:   'bg-amber-50 text-amber-800 border-amber-200',
  user_deactivated:  'bg-gray-100 text-gray-700 border-gray-200',
}

const EVENT_LABELS: Record<AdminAlertEvent, string> = {
  discount_applied:  'Discount Applied',
  guest_reduced:     'Guest Count Reduced',
  checkout_voided:   'Checkout Voided',
  refund_recorded:   'Refund Recorded',
  booking_cancelled: 'Booking Cancelled',
  booking_no_show:   'Booking No-Show',
  user_deactivated:  'User Deactivated',
}

export function AuditLogClient({ alerts, filter }: Props) {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const [pending, startTransition] = useTransition()
  const [activeId, setActiveId] = useState<string | null>(null)

  function setFilter(v: string) {
    const p = new URLSearchParams(searchParams.toString())
    p.set('filter', v)
    router.replace(`/settings/audit-log?${p.toString()}`)
  }

  function ack(id: string) {
    setActiveId(id)
    startTransition(async () => {
      const r = await acknowledgeAlert(id)
      setActiveId(null)
      if (!r.success) { alert(r.error); return }
      router.refresh()
    })
  }

  function deepLinkFor(a: AdminAlertWithUser): string | null {
    if (a.entity_type === 'checkout' && a.payload && typeof a.payload === 'object' && 'booking_id' in a.payload) {
      return `/checkout/${a.payload.booking_id as string}`
    }
    if (a.entity_type === 'user') return `/settings/users/${a.entity_id}`
    if (a.entity_type === 'booking') return `/bookings/${a.entity_id}`
    return null
  }

  return (
    <div className="space-y-4">
      {/* Filter chips */}
      <div className="flex flex-wrap gap-1 rounded-xl border border-gray-200 bg-white p-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setFilter(f.value)}
            className={cn(
              'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
              filter === f.value ? 'bg-slate-900 text-white' : 'text-gray-600 hover:bg-gray-50',
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {alerts.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-12 text-center">
          <p className="text-sm font-medium text-gray-700">
            {filter === 'unread' ? 'No unread alerts.' : 'No matching alerts.'}
          </p>
          <p className="mt-1 text-xs text-gray-500">
            Flagged events (discounts, guest reductions, voids, refunds) appear here.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {alerts.map((a) => {
            const isUnread = !a.acknowledged_at
            const link = deepLinkFor(a)
            return (
              <li
                key={a.id}
                className={cn(
                  'rounded-xl border bg-white p-4',
                  isUnread ? 'border-amber-300' : 'border-gray-200 opacity-75',
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${EVENT_BADGE[a.event_type]}`}>
                        {EVENT_LABELS[a.event_type]}
                      </span>
                      {isUnread && (
                        <span className="h-2 w-2 rounded-full bg-amber-500" title="Unread" />
                      )}
                      <span className="text-xs text-gray-500">
                        {new Date(a.created_at).toLocaleString('en-GB', {
                          dateStyle: 'medium', timeStyle: 'short',
                        })}
                        {a.created_user_name && <> · by {a.created_user_name}</>}
                      </span>
                    </div>
                    <p className="mt-1.5 text-sm text-gray-900">{a.summary}</p>
                    {a.acknowledged_at && (
                      <p className="mt-1 text-xs text-gray-500">
                        Acknowledged {formatDate(a.acknowledged_at.slice(0, 10))}
                        {a.acknowledged_user_name && ` by ${a.acknowledged_user_name}`}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-1">
                    {link && (
                      <Link href={link} className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50">
                        Open <ExternalLink size={11} />
                      </Link>
                    )}
                    {isUnread && (
                      <Button
                        type="button"
                        variant="primary"
                        size="sm"
                        loading={pending && activeId === a.id}
                        onClick={() => ack(a.id)}
                      >
                        <Check size={12} /> Acknowledge
                      </Button>
                    )}
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
