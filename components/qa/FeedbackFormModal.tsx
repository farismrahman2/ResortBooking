'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/Textarea'
import { StarRating } from './StarRating'
import { submitQaReview } from '@/lib/actions/qa'
import { formatDate } from '@/lib/formatters/dates'
import { cn } from '@/lib/utils'
import type { QaPendingBooking, WouldReturn } from '@/lib/supabase/types-qa'

interface Props {
  booking: QaPendingBooking | null
  onClose: () => void
}

export function FeedbackFormModal({ booking, onClose }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [roomRating, setRoomRating]       = useState<number | null>(null)
  const [roomComment, setRoomComment]     = useState('')
  const [foodRating, setFoodRating]       = useState<number | null>(null)
  const [foodComment, setFoodComment]     = useState('')
  const [otherIssue, setOtherIssue]       = useState(false)
  const [otherComment, setOtherComment]   = useState('')
  const [overallRating, setOverallRating] = useState<number | null>(null)
  const [wouldReturn, setWouldReturn]     = useState<WouldReturn | null>(null)

  function reset() {
    setError(null)
    setRoomRating(null); setRoomComment('')
    setFoodRating(null); setFoodComment('')
    setOtherIssue(false); setOtherComment('')
    setOverallRating(null); setWouldReturn(null)
  }

  function close() {
    reset()
    onClose()
  }

  // A rating below 5 must come with a reason — that "why" is what drives
  // service improvement. Room/food need their own note; a low overall is
  // satisfied by a note in any of the comment boxes.
  const ratingsComplete   = roomRating != null && foodRating != null && overallRating != null
  const roomReasonNeeded  = roomRating != null && roomRating < 5 && !roomComment.trim()
  const foodReasonNeeded  = foodRating != null && foodRating < 5 && !foodComment.trim()
  const anyReasonGiven    = !!(roomComment.trim() || foodComment.trim() || otherComment.trim())
  const overallReasonNeeded = overallRating != null && overallRating < 5 && !anyReasonGiven
  const canSubmit = ratingsComplete && !roomReasonNeeded && !foodReasonNeeded && !overallReasonNeeded

  function submit() {
    if (!booking) return
    if (!ratingsComplete) {
      setError('Please rate room service, food taste, and overall impression.')
      return
    }
    if (!canSubmit) {
      setError('Please add a reason for any rating below 5★ — that’s how we know what to improve.')
      return
    }
    setError(null)
    startTransition(async () => {
      const res = await submitQaReview({
        booking_id:           booking.id,
        room_service_rating:  roomRating!,
        room_service_comment: roomComment.trim() || null,
        food_rating:          foodRating!,
        food_comment:         foodComment.trim() || null,
        other_issue:          otherIssue,
        other_comment:        otherComment.trim() || null,
        overall_rating:       overallRating!,
        would_return:         wouldReturn,
      })
      if (!res.success) { setError(res.error); return }
      close()
      router.refresh()
    })
  }

  return (
    <Modal open={booking != null} onClose={close} title="Record Guest Feedback" size="lg">
      {booking && (
        <div className="overflow-y-auto px-5 py-4 space-y-5">
          <div className="rounded-lg bg-gray-50 px-3 py-2.5 text-sm">
            <p className="font-semibold text-gray-900">{booking.customer_name}</p>
            <p className="text-xs text-gray-500">
              {booking.customer_phone} · {booking.booking_number} · departed {formatDate(booking.departed_on)}
            </p>
          </div>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
          )}

          <div className="space-y-1.5">
            <StarRating label="Room service" value={roomRating} onChange={setRoomRating} />
            <Textarea
              placeholder={roomRating != null && roomRating < 5
                ? 'Why not 5★? What went wrong with the room / housekeeping / staff?'
                : 'Comments on housekeeping, room condition, staff… (optional)'}
              rows={2}
              value={roomComment}
              onChange={(e) => setRoomComment(e.target.value)}
              error={roomReasonNeeded ? 'A reason is required because this isn’t 5★.' : undefined}
            />
          </div>

          <div className="space-y-1.5">
            <StarRating label="Food taste" value={foodRating} onChange={setFoodRating} />
            <Textarea
              placeholder={foodRating != null && foodRating < 5
                ? 'Why not 5★? Which dish or meal disappointed the guest?'
                : 'Comments on restaurant, breakfast, taste… (optional)'}
              rows={2}
              value={foodComment}
              onChange={(e) => setFoodComment(e.target.value)}
              error={foodReasonNeeded ? 'A reason is required because this isn’t 5★.' : undefined}
            />
          </div>

          <div className="space-y-1.5">
            <p className="field-label">Any other problem?</p>
            <div className="flex gap-2">
              <ToggleChip active={!otherIssue} onClick={() => setOtherIssue(false)}>No issues</ToggleChip>
              <ToggleChip active={otherIssue} tone="red" onClick={() => setOtherIssue(true)}>Issue raised</ToggleChip>
            </div>
            <Textarea placeholder={otherIssue ? 'Describe the problem the guest reported…' : 'Anything else the guest mentioned… (optional)'}
              rows={2} value={otherComment} onChange={(e) => setOtherComment(e.target.value)} />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <StarRating label="Overall impression" value={overallRating} onChange={setOverallRating} />
              {overallReasonNeeded && (
                <p className="mt-1 text-xs text-red-600">
                  Below 5★ — add a note in any comment box above explaining why.
                </p>
              )}
            </div>
            <div>
              <p className="field-label">Would return?</p>
              <div className="flex gap-2">
                {(['yes', 'maybe', 'no'] as const).map((v) => (
                  <ToggleChip key={v} active={wouldReturn === v}
                    tone={v === 'no' ? 'red' : v === 'yes' ? 'green' : undefined}
                    onClick={() => setWouldReturn(wouldReturn === v ? null : v)}>
                    {v.charAt(0).toUpperCase() + v.slice(1)}
                  </ToggleChip>
                ))}
              </div>
            </div>
          </div>

          {ratingsComplete && !canSubmit && (
            <p className="flex items-center gap-1.5 text-xs text-amber-700">
              <AlertCircle size={13} />
              Add a reason for every rating below 5★ to enable Save — it tells us what to improve.
            </p>
          )}

          <div className="flex justify-end gap-2 border-t border-gray-100 pt-4">
            <Button variant="outline" onClick={close} disabled={pending}>Cancel</Button>
            <Button onClick={submit} loading={pending} disabled={!canSubmit}>Save Feedback</Button>
          </div>
        </div>
      )}
    </Modal>
  )
}

function ToggleChip({ active, tone, onClick, children }: {
  active: boolean
  tone?: 'red' | 'green'
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
        active
          ? tone === 'red'
            ? 'border-red-300 bg-red-50 text-red-700'
            : tone === 'green'
              ? 'border-green-300 bg-green-50 text-green-700'
              : 'border-forest-300 bg-forest-50 text-forest-800'
          : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50',
      )}
    >
      {children}
    </button>
  )
}
