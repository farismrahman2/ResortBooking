'use client'

import { useEffect, useState } from 'react'
import { MessageSquareHeart, AlertTriangle } from 'lucide-react'
import { StarsInline } from './StarRating'
import type { GuestFeedbackSummary } from '@/lib/supabase/types-qa'

/**
 * Shows previous QA feedback for the phone number being typed into a
 * quote/booking form — so the team knows a returning guest's history
 * (and past complaints) before confirming the new stay.
 * Renders nothing for new guests, short input, or users without qa access.
 */
export function ReturningGuestBadge({ phone }: { phone: string | undefined | null }) {
  const [summary, setSummary] = useState<GuestFeedbackSummary | null>(null)

  useEffect(() => {
    const digits = (phone ?? '').replace(/\D/g, '')
    if (digits.length < 10) { setSummary(null); return }

    const controller = new AbortController()
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/guest-feedback?phone=${encodeURIComponent(digits)}`, {
          signal: controller.signal,
        })
        if (!res.ok) { setSummary(null); return }
        const json = await res.json()
        setSummary(json.summary ?? null)
      } catch {
        setSummary(null)
      }
    }, 400)

    return () => { clearTimeout(timer); controller.abort() }
  }, [phone])

  if (!summary) return null

  const lastIssue = summary.reviews.find((r) => r.other_issue && r.other_comment)

  return (
    <div className="mt-2 rounded-lg border border-forest-200 bg-forest-50 px-3 py-2 text-xs">
      <p className="flex items-center gap-1.5 font-semibold text-forest-800">
        <MessageSquareHeart size={13} />
        Returning guest — {summary.review_count} previous feedback record{summary.review_count === 1 ? '' : 's'}
      </p>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-gray-700">
        <span className="inline-flex items-center gap-1">Overall <StarsInline value={summary.avg_overall} /></span>
        <span className="inline-flex items-center gap-1">Room <StarsInline value={summary.avg_room} /></span>
        <span className="inline-flex items-center gap-1">Food <StarsInline value={summary.avg_food} /></span>
        {summary.last_review?.would_return && (
          <span>Would return: <span className="font-semibold">{summary.last_review.would_return}</span></span>
        )}
      </div>
      {lastIssue && (
        <p className="mt-1 flex items-start gap-1.5 text-red-700">
          <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" />
          <span>Previously reported: {lastIssue.other_comment}</span>
        </p>
      )}
    </div>
  )
}
