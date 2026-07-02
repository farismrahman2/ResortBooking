'use client'

import { useMemo, useState } from 'react'
import { Copy, Check, Sparkles } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import type { QaReviewWithBooking } from '@/lib/supabase/types-qa'

type RangeKey = '7d' | '30d' | '90d' | 'all'

const RANGES: Array<{ key: RangeKey; label: string; days: number | null }> = [
  { key: '7d',  label: 'Last 7 days',  days: 7 },
  { key: '30d', label: 'Last 30 days', days: 30 },
  { key: '90d', label: 'Last 90 days', days: 90 },
  { key: 'all', label: 'All',          days: null },
]

/** Markdown table cells can't contain pipes or newlines. */
function cell(text: string | null): string {
  if (!text) return ''
  return text.replace(/\|/g, '/').replace(/\s*\n\s*/g, ' ').trim()
}

function buildPrompt(reviews: QaReviewWithBooking[], rangeLabel: string): string {
  const completed = reviews.filter((r) => r.status === 'completed')
  const unreachable = reviews.filter((r) => r.status === 'unreachable').length
  const declined = reviews.filter((r) => r.status === 'declined').length

  const header =
    '| Date | Guest | Phone | Stay date | Package | Room service (1-5) | Food taste (1-5) | Overall (1-5) | Would return | Issue raised | Room comment | Food comment | Other comment |'
  const divider = '|' + ' --- |'.repeat(13)

  const rows = completed.map((r) => {
    const stay = r.booking ? r.booking.visit_date : ''
    const pkg = r.booking ? (r.booking.package_type === 'night' ? 'Overnight' : 'Daylong') : ''
    return `| ${r.created_at.slice(0, 10)} | ${cell(r.customer_name)} | ${r.customer_phone} | ${stay} | ${pkg} | ${r.room_service_rating ?? ''} | ${r.food_rating ?? ''} | ${r.overall_rating ?? ''} | ${r.would_return ?? ''} | ${r.other_issue ? 'YES' : 'no'} | ${cell(r.room_service_comment)} | ${cell(r.food_comment)} | ${cell(r.other_comment)} |`
  })

  return `You are a hospitality quality analyst for Garden Centre Resort, a boutique eco-resort in Bangladesh. Below is post-stay guest feedback our team collected by phone (period: ${rangeLabel.toLowerCase()}). Each guest rated room service and food taste from 1 (very poor) to 5 (excellent). A repeat guest appears on multiple rows with the same phone number.

Call outcomes for this period: ${completed.length} feedback collected, ${unreachable} unreachable, ${declined} declined.

Write a clear management report with these sections:

1. **Executive summary** — overall guest sentiment in 3-4 sentences, with average scores.
2. **Room service** — average score, whether it is improving or slipping over the period, and the recurring themes in the comments (good and bad).
3. **Food & restaurant** — same treatment for food taste.
4. **Problems & complaints** — group the "issue raised" rows into recurring problem types, quote the most serious ones, and flag anything urgent.
5. **Guests at risk** — guests who said they would not return or complained more than once (match by phone number), and what it would take to win them back.
6. **Top 5 recommendations** — specific, actionable steps ordered by impact on guest experience, based only on this data.

Keep the report concise and written for a resort owner, not a data analyst. If the sample is small, say so rather than over-concluding.

Guest feedback data:

${header}
${divider}
${rows.join('\n')}
`
}

export function AiReportExport({ reviews }: { reviews: QaReviewWithBooking[] }) {
  const [open, setOpen] = useState(false)
  const [range, setRange] = useState<RangeKey>('30d')
  const [copied, setCopied] = useState(false)

  const { text, count } = useMemo(() => {
    const preset = RANGES.find((r) => r.key === range)!
    let inRange = reviews
    if (preset.days != null) {
      const from = new Date()
      from.setDate(from.getDate() - preset.days)
      const fromIso = from.toISOString().slice(0, 10)
      inRange = reviews.filter((r) => r.created_at.slice(0, 10) >= fromIso)
    }
    return {
      text:  buildPrompt(inRange, preset.label),
      count: inRange.filter((r) => r.status === 'completed').length,
    }
  }, [reviews, range])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      // Fallback for browsers that deny clipboard without gesture
      const el = document.createElement('textarea')
      el.value = text
      el.style.position = 'fixed'
      el.style.opacity = '0'
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Sparkles size={14} className="text-amber-500" />
        AI Report
      </Button>

      <Modal open={open} onClose={() => setOpen(false)} title="AI Feedback Report" size="xl">
        <div className="overflow-y-auto px-5 py-4 space-y-4">
          <p className="text-sm text-gray-600">
            Copy the prompt below and paste it into Claude — it contains the guest feedback
            data as a table plus instructions to write a management report on service quality.
          </p>

          <div className="flex flex-wrap items-center gap-2">
            {RANGES.map((r) => (
              <button
                key={r.key}
                onClick={() => setRange(r.key)}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                  range === r.key
                    ? 'border-forest-300 bg-forest-50 text-forest-800'
                    : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50',
                )}
              >
                {r.label}
              </button>
            ))}
            <span className="ml-auto text-xs text-gray-500">
              {count} completed review{count === 1 ? '' : 's'} in range
            </span>
          </div>

          {count === 0 ? (
            <p className="rounded-lg border border-dashed border-gray-200 p-6 text-center text-sm text-gray-400">
              No completed feedback in this period — pick a wider range.
            </p>
          ) : (
            <textarea
              readOnly
              value={text}
              rows={14}
              className="w-full rounded-lg border border-gray-200 bg-gray-50 p-3 font-mono text-[11px] leading-relaxed text-gray-700 focus:outline-none"
            />
          )}

          <div className="flex justify-end gap-2 border-t border-gray-100 pt-4">
            <Button variant="outline" onClick={() => setOpen(false)}>Close</Button>
            <Button
              variant={copied ? 'secondary' : 'primary'}
              onClick={handleCopy}
              disabled={count === 0}
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? 'Copied!' : 'Copy prompt for Claude'}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
