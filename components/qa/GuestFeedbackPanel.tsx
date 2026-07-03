import Link from 'next/link'
import { MessageSquareHeart, AlertTriangle } from 'lucide-react'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import { StarsInline } from './StarRating'
import { hasPermission } from '@/lib/auth/permissions'
import { getGuestFeedbackByPhone } from '@/lib/queries/qa'
import { formatDate } from '@/lib/formatters/dates'

/**
 * Server component — cross-stay QA feedback history for one guest, shown on
 * the booking detail page. Renders nothing when the viewer lacks qa:read,
 * the guest has no history, or the qa migration hasn't been applied.
 */
export async function GuestFeedbackPanel({ phone, excludeBookingId }: {
  phone: string
  excludeBookingId?: string
}) {
  if (!(await hasPermission('qa', 'read'))) return null

  let summary: Awaited<ReturnType<typeof getGuestFeedbackByPhone>> = null
  try {
    summary = await getGuestFeedbackByPhone(phone)
  } catch {
    return null // qa migration not applied yet
  }
  if (!summary) return null

  const reviews = summary.reviews.filter((r) => r.booking_id !== excludeBookingId)

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <span className="inline-flex items-center gap-2">
            <MessageSquareHeart size={16} className="text-forest-700" />
            Guest Feedback History
          </span>
        </CardTitle>
      </CardHeader>

      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-600">
        <span>{summary.review_count} feedback record{summary.review_count === 1 ? '' : 's'}</span>
        <span className="inline-flex items-center gap-1">Overall <StarsInline value={summary.avg_overall} /></span>
        <span className="inline-flex items-center gap-1">Room service <StarsInline value={summary.avg_room} /></span>
        <span className="inline-flex items-center gap-1">Food <StarsInline value={summary.avg_food} /></span>
        {summary.issue_count > 0 && (
          <span className="inline-flex items-center gap-1 font-semibold text-red-600">
            <AlertTriangle size={12} /> {summary.issue_count} issue{summary.issue_count === 1 ? '' : 's'} reported
          </span>
        )}
      </div>

      {reviews.length > 0 && (
        <div className="mt-3 space-y-2">
          {reviews.slice(0, 3).map((r) => (
            <div key={r.id} className="rounded-lg bg-gray-50 px-3 py-2 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-gray-700">
                  {r.booking ? `Stay on ${formatDate(r.booking.visit_date)}` : formatDate(r.created_at.slice(0, 10))}
                </span>
                {r.status === 'completed' ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="inline-flex items-center gap-1">Room <StarsInline value={r.room_service_rating} /></span>
                    <span className="inline-flex items-center gap-1">Food <StarsInline value={r.food_rating} /></span>
                  </span>
                ) : (
                  <span className="text-gray-400">({r.status})</span>
                )}
                {r.other_issue && (
                  <span className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-700">
                    Issue
                  </span>
                )}
              </div>
              {(r.other_comment || r.room_service_comment || r.food_comment) && (
                <p className="mt-1 text-gray-600">
                  {r.other_comment ?? r.room_service_comment ?? r.food_comment}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      <Link href="/qa" className="mt-3 inline-block text-xs font-medium text-forest-700 hover:underline">
        Open Guest Feedback →
      </Link>
    </Card>
  )
}
