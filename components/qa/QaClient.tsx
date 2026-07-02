'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { PhoneOff, Search, ThumbsDown } from 'lucide-react'
import { Tabs } from '@/components/ui/Tabs'
import { Button } from '@/components/ui/Button'
import { WhatsAppLink } from '@/components/ui/WhatsAppLink'
import { StarsInline } from './StarRating'
import { FeedbackFormModal } from './FeedbackFormModal'
import { AiReportExport } from './AiReportExport'
import { markQaCallSkipped } from '@/lib/actions/qa'
import { formatDate } from '@/lib/formatters/dates'
import { cn } from '@/lib/utils'
import type {
  QaPendingBooking, QaReviewStatus, QaReviewWithBooking, QaTrends,
} from '@/lib/supabase/types-qa'

interface Props {
  pending:  QaPendingBooking[]
  reviews:  QaReviewWithBooking[]
  trends:   QaTrends
  canWrite: boolean
  /** Whether the viewer may open /bookings/[id] — review collectors can't. */
  canViewBookings: boolean
}

const STATUS_STYLES: Record<QaReviewStatus, string> = {
  completed:   'bg-green-50 text-green-700 border-green-200',
  unreachable: 'bg-amber-50 text-amber-700 border-amber-200',
  declined:    'bg-gray-100 text-gray-600 border-gray-200',
}

const STATUS_LABELS: Record<QaReviewStatus, string> = {
  completed:   'Completed',
  unreachable: 'Unreachable',
  declined:    'Declined',
}

function roomLabel(slug: string): string {
  return slug.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function BookingRef({ id, number, canLink }: { id: string; number: string; canLink: boolean }) {
  if (!canLink) return <span className="font-medium text-gray-600">{number}</span>
  return <Link href={`/bookings/${id}`} className="text-forest-700 hover:underline">{number}</Link>
}

export function QaClient({ pending, reviews, trends, canWrite, canViewBookings }: Props) {
  const [tab, setTab] = useState('pending')
  const [active, setActive] = useState<QaPendingBooking | null>(null)

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-3">
        <Tabs
          className="min-w-0 flex-1"
          items={[
            { id: 'pending',   label: 'Pending Calls', count: pending.length },
            { id: 'completed', label: 'Collected Feedback', count: reviews.filter((r) => r.status === 'completed').length },
            { id: 'trends',    label: 'Trends' },
          ]}
          active={tab}
          onChange={setTab}
        />
        <div className="pb-1.5 flex-shrink-0">
          <AiReportExport reviews={reviews} />
        </div>
      </div>

      {tab === 'pending'   && <PendingTab pending={pending} canWrite={canWrite} canViewBookings={canViewBookings} onRecord={setActive} />}
      {tab === 'completed' && <CompletedTab reviews={reviews} canViewBookings={canViewBookings} />}
      {tab === 'trends'    && <TrendsTab trends={trends} canViewBookings={canViewBookings} />}

      <FeedbackFormModal booking={active} onClose={() => setActive(null)} />
    </div>
  )
}

// ─── Pending calls ────────────────────────────────────────────────────────────

function PendingTab({ pending, canWrite, canViewBookings, onRecord }: {
  pending: QaPendingBooking[]
  canWrite: boolean
  canViewBookings: boolean
  onRecord: (b: QaPendingBooking) => void
}) {
  const router = useRouter()
  const [busy, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function skip(booking: QaPendingBooking, status: 'unreachable' | 'declined') {
    setError(null)
    startTransition(async () => {
      const res = await markQaCallSkipped({ booking_id: booking.id, status })
      if (!res.success) { setError(res.error); return }
      router.refresh()
    })
  }

  if (pending.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-gray-200 p-8 text-center text-sm text-gray-400">
        No guests waiting for a feedback call — every checkout from the last 2 days has been covered.
      </p>
    )
  }

  return (
    <div className="space-y-2">
      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      <p className="text-xs text-gray-500">
        Guests who checked out in the last 2 days. Call them, then record their feedback.
      </p>
      {pending.map((b) => (
        <div key={b.id} className="rounded-lg border border-gray-200 bg-white px-4 py-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="font-medium text-gray-900 truncate">{b.customer_name}</p>
                {b.prior_attempt && (
                  <span className={cn('rounded-full border px-2 py-0.5 text-[10px] font-semibold', STATUS_STYLES[b.prior_attempt])}>
                    {STATUS_LABELS[b.prior_attempt]} — retry
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-500">
                <BookingRef id={b.id} number={b.booking_number} canLink={canViewBookings} />
                {' · '}departed {formatDate(b.departed_on)}
                {b.nights ? ` · ${b.nights} night${b.nights > 1 ? 's' : ''}` : ' · daylong'}
                {b.rooms.length > 0 && ` · ${b.rooms.map((r) => `${r.qty}× ${roomLabel(r.room_type)}`).join(', ')}`}
              </p>
              <div className="mt-1 flex items-center gap-2 text-xs text-gray-600">
                <span className="font-mono">{b.customer_phone}</span>
                <WhatsAppLink phone={b.customer_phone} />
              </div>
            </div>
            {canWrite && (
              <div className="flex items-center gap-1.5">
                <Button size="sm" onClick={() => onRecord(b)} disabled={busy}>Record Feedback</Button>
                <button
                  title="Couldn't reach the guest"
                  onClick={() => skip(b, 'unreachable')}
                  disabled={busy}
                  className="rounded-lg border border-gray-300 p-1.5 text-gray-500 hover:bg-amber-50 hover:text-amber-700 disabled:opacity-50"
                >
                  <PhoneOff size={14} />
                </button>
                <button
                  title="Guest declined to give feedback"
                  onClick={() => skip(b, 'declined')}
                  disabled={busy}
                  className="rounded-lg border border-gray-300 p-1.5 text-gray-500 hover:bg-gray-100 disabled:opacity-50"
                >
                  <ThumbsDown size={14} />
                </button>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Collected feedback ───────────────────────────────────────────────────────

function CompletedTab({ reviews, canViewBookings }: { reviews: QaReviewWithBooking[]; canViewBookings: boolean }) {
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return reviews
    return reviews.filter((r) =>
      r.customer_name.toLowerCase().includes(q) ||
      r.customer_phone.includes(q.replace(/\D/g, '') || q) ||
      (r.booking?.booking_number ?? '').toLowerCase().includes(q),
    )
  }, [reviews, search])

  return (
    <div className="space-y-3">
      <div className="relative max-w-sm">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by guest, phone, or booking #"
          className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm placeholder:text-gray-400 focus:border-forest-600 focus:outline-none focus:ring-2 focus:ring-forest-200"
        />
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-lg border border-dashed border-gray-200 p-8 text-center text-sm text-gray-400">
          {reviews.length === 0 ? 'No feedback collected yet.' : 'No feedback matches your search.'}
        </p>
      ) : (
        <div className="space-y-2">
          {filtered.map((r) => <ReviewCard key={r.id} review={r} canViewBookings={canViewBookings} />)}
        </div>
      )}
    </div>
  )
}

function ReviewCard({ review: r, canViewBookings }: { review: QaReviewWithBooking; canViewBookings: boolean }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-medium text-gray-900">{r.customer_name}</p>
        <span className={cn('rounded-full border px-2 py-0.5 text-[10px] font-semibold', STATUS_STYLES[r.status])}>
          {STATUS_LABELS[r.status]}
        </span>
        {r.other_issue && (
          <span className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-700">
            Issue raised
          </span>
        )}
        <span className="ml-auto text-xs text-gray-400">{formatDate(r.created_at.slice(0, 10))}</span>
      </div>
      <p className="mt-0.5 text-xs text-gray-500">
        <span className="font-mono">{r.customer_phone}</span>
        {r.booking && (
          <>
            {' · '}
            <BookingRef id={r.booking_id} number={r.booking.booking_number} canLink={canViewBookings} />
            {' · '}stayed {formatDate(r.booking.visit_date)}
          </>
        )}
        {r.reviewed_by_name && ` · collected by ${r.reviewed_by_name}`}
      </p>

      {r.status === 'completed' && (
        <div className="mt-2 grid grid-cols-3 gap-2 sm:max-w-md">
          <RatingCell label="Room service" value={r.room_service_rating} />
          <RatingCell label="Food taste" value={r.food_rating} />
          <RatingCell label="Overall" value={r.overall_rating} />
        </div>
      )}

      {(r.room_service_comment || r.food_comment || r.other_comment) && (
        <div className="mt-2 space-y-1 text-xs text-gray-600">
          {r.room_service_comment && <p><span className="font-semibold">Room:</span> {r.room_service_comment}</p>}
          {r.food_comment && <p><span className="font-semibold">Food:</span> {r.food_comment}</p>}
          {r.other_comment && <p><span className="font-semibold">Other:</span> {r.other_comment}</p>}
        </div>
      )}

      {r.would_return && (
        <p className="mt-1.5 text-xs text-gray-500">
          Would return: <span className={cn('font-semibold', r.would_return === 'no' ? 'text-red-600' : r.would_return === 'yes' ? 'text-green-700' : 'text-amber-600')}>
            {r.would_return}
          </span>
        </p>
      )}
    </div>
  )
}

function RatingCell({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="rounded-lg bg-gray-50 px-2.5 py-1.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      <StarsInline value={value} />
    </div>
  )
}

// ─── Trends ───────────────────────────────────────────────────────────────────

function TrendsTab({ trends, canViewBookings }: { trends: QaTrends; canViewBookings: boolean }) {
  const coveragePct = trends.checkouts_30d > 0
    ? Math.round((trends.attempted_30d / trends.checkouts_30d) * 100)
    : null

  return (
    <div className="space-y-5">
      {/* Coverage tiles — last 30 days */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Checkouts (30d)" value={String(trends.checkouts_30d)} />
        <Kpi label="Calls attempted" value={String(trends.attempted_30d)} />
        <Kpi label="Feedback collected" value={String(trends.completed_30d)} emphasis />
        <Kpi label="Coverage" value={coveragePct == null ? '—' : `${coveragePct}%`} />
      </div>

      {/* Monthly averages */}
      <div>
        <h3 className="mb-2 text-sm font-semibold text-gray-900">Monthly service scores</h3>
        {trends.monthly.length === 0 ? (
          <p className="rounded-lg border border-dashed border-gray-200 p-6 text-center text-sm text-gray-400">
            Trends appear once feedback starts coming in.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                  <th className="px-4 py-2.5">Month</th>
                  <th className="px-4 py-2.5">Reviews</th>
                  <th className="px-4 py-2.5">Room service</th>
                  <th className="px-4 py-2.5">Food taste</th>
                  <th className="px-4 py-2.5">Overall</th>
                  <th className="px-4 py-2.5">Issues</th>
                </tr>
              </thead>
              <tbody>
                {trends.monthly.map((m) => (
                  <tr key={m.month} className="border-b border-gray-100 last:border-0">
                    <td className="px-4 py-2.5 font-medium text-gray-900">{m.month}</td>
                    <td className="px-4 py-2.5 tabular-nums text-gray-700">{m.review_count}</td>
                    <td className="px-4 py-2.5"><StarsInline value={m.avg_room_service} /></td>
                    <td className="px-4 py-2.5"><StarsInline value={m.avg_food} /></td>
                    <td className="px-4 py-2.5"><StarsInline value={m.avg_overall} /></td>
                    <td className={cn('px-4 py-2.5 tabular-nums', m.issue_count > 0 ? 'font-semibold text-red-600' : 'text-gray-400')}>
                      {m.issue_count}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Recent issues */}
      <div>
        <h3 className="mb-2 text-sm font-semibold text-gray-900">Recent problems reported</h3>
        {trends.recent_issues.length === 0 ? (
          <p className="rounded-lg border border-dashed border-gray-200 p-6 text-center text-sm text-gray-400">
            No problems reported. Keep it up.
          </p>
        ) : (
          <div className="space-y-2">
            {trends.recent_issues.map((r) => <ReviewCard key={r.id} review={r} canViewBookings={canViewBookings} />)}
          </div>
        )}
      </div>

      {/* Repeat complainers */}
      {trends.repeat_complainers.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-gray-900">Guests with repeated complaints</h3>
          <div className="space-y-2">
            {trends.repeat_complainers.map((g) => (
              <div key={g.phone} className="flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm">
                <div>
                  <p className="font-medium text-gray-900">{g.name}</p>
                  <p className="font-mono text-xs text-gray-500">{g.phone}</p>
                </div>
                <span className="text-xs font-semibold text-red-700">{g.issue_count} complaints</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function Kpi({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      <p className={cn('mt-1 text-2xl font-bold tabular-nums', emphasis ? 'text-forest-700' : 'text-gray-900')}>{value}</p>
    </div>
  )
}
