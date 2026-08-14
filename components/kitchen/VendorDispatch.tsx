'use client'

import { useState } from 'react'
import { Copy, Check, MessageCircle, AlertTriangle, Send } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from '@/lib/toast'
import { recordDispatch } from '@/lib/actions/kitchen'
import { safeCall } from '@/lib/actions/safe-call'
import { buildOrderMessage, buildAmendmentMessage } from '@/lib/kitchen/messages'
import type { KitchenRequisition, VendorSection } from '@/lib/supabase/types-kitchen'

/** "6:04 pm" — the groups run on the clock, not on dates. */
function sentAtLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', {
    hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Dhaka',
  })
}

/**
 * The fan-out screen. One card per vendor, each with the exact message to
 * paste into that vendor's WhatsApp group.
 *
 * Vendors with nothing to supply still get a card containing "No order" —
 * the groups already post that, and silence would be indistinguishable from
 * a message that failed to send.
 */
export function VendorDispatch({
  requisition, sections, requisitionId, dispatched = {}, amendmentOf,
}: {
  requisition: Pick<KitchenRequisition, 'requisition_no' | 'event_date' | 'is_emergency'>
  sections: VendorSection[]
  requisitionId: string
  /** vendor id → when its message was last copied. */
  dispatched?: Record<string, string>
  /** Set when this requisition is an amendment — changes the message shape. */
  amendmentOf?: { parentRequisitionNo: string; amendmentNo: string }
}) {
  const [copied, setCopied] = useState<string | null>(null)
  const [sent, setSent] = useState<Record<string, string>>(dispatched)

  async function copy(vendorId: string, text: string) {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      // Clipboard API needs a user gesture in some Android WebViews; fall back.
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'; ta.style.opacity = '0'
      document.body.appendChild(ta); ta.select()
      try { document.execCommand('copy') } finally { document.body.removeChild(ta) }
    }
    setCopied(vendorId)
    toast.success('Message copied — paste it into the group')
    setTimeout(() => setCopied((c) => (c === vendorId ? null : c)), 2500)

    // Mark it sent optimistically. The record is what lets the requisition
    // tell an edit from an amendment, and what answers "did anyone actually
    // send the vegetable order?" — but a failure here must never look like a
    // failure to copy, which already succeeded.
    const stamp = new Date().toISOString()
    setSent((prev) => ({ ...prev, [vendorId]: stamp }))
    const r = await safeCall(() => recordDispatch(requisitionId, vendorId, text))
    if (!r.success) {
      setSent((prev) => {
        const next = { ...prev }
        if (next[vendorId] === stamp) delete next[vendorId]
        return next
      })
      toast.error('Copied, but we couldn\u2019t record it as sent', { description: r.error })
    }
  }

  const untaggedSection = sections.find((s) => s.vendor.slug === '_untagged')

  return (
    <div className="space-y-3">
      {untaggedSection && untaggedSection.lines.length > 0 && (
        <div className="flex items-start gap-2 rounded-xl border border-red-300 bg-red-50 p-3">
          <AlertTriangle size={16} className="mt-0.5 flex-shrink-0 text-red-600" />
          <div className="text-sm text-red-900">
            <p className="font-semibold">
              {untaggedSection.lines.length} item{untaggedSection.lines.length === 1 ? '' : 's'} aren&apos;t
              assigned to a vendor
            </p>
            <p className="mt-0.5 text-xs">
              They won&apos;t appear in any supplier&apos;s message. Set each item&apos;s vendor on the
              requisition, or they simply won&apos;t get ordered.
            </p>
          </div>
        </div>
      )}

      {sections.filter((s) => s.vendor.slug !== '_untagged').map((s) => {
        const text = amendmentOf
          ? buildAmendmentMessage({
              parentRequisitionNo: amendmentOf.parentRequisitionNo,
              amendmentNo: amendmentOf.amendmentNo,
              eventDate:   requisition.event_date,
              vendorName:  s.vendor.display_name,
              lines:       s.lines,
            })
          : buildOrderMessage(requisition, s)
        // An amendment that doesn't touch this vendor has nothing to say to
        // them. Sending "no change" to six groups is how people learn to stop
        // reading the messages.
        const empty = s.lines.length === 0
        if (amendmentOf && empty) return null
        const isCopied = copied === s.vendor.id
        const sentAt = sent[s.vendor.id]
        return (
          <div
            key={s.vendor.id}
            className={cn(
              'overflow-hidden rounded-xl border bg-white',
              empty ? 'border-gray-200' : 'border-forest-200',
            )}
          >
            <div className={cn(
              'flex items-center justify-between gap-2 border-b px-3 py-2',
              empty ? 'border-gray-200 bg-gray-50' : 'border-forest-100 bg-forest-50',
            )}>
              <p className={cn('text-sm font-semibold', empty ? 'text-gray-600' : 'text-forest-900')}>
                {s.vendor.display_name}
                <span className="ml-1.5 text-xs font-normal text-gray-500">
                  {empty ? 'no order' : `${s.lines.length} item${s.lines.length === 1 ? '' : 's'}`}
                </span>
                {sentAt && (
                  <span className="ml-1.5 inline-flex items-center gap-1 rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] font-semibold text-green-800">
                    <Send size={9} /> sent {sentAtLabel(sentAt)}
                  </span>
                )}
              </p>
              <button
                type="button"
                onClick={() => copy(s.vendor.id, text)}
                className={cn(
                  'inline-flex min-h-[38px] flex-shrink-0 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition-colors',
                  isCopied
                    ? 'bg-green-600 text-white'
                    : 'bg-[#25D366] text-white hover:bg-[#1ebe5d]',
                )}
              >
                {isCopied
                  ? <><Check size={13} /> Copied</>
                  : <><Copy size={13} /> {sentAt ? 'Copy again' : 'Copy message'}</>}
              </button>
            </div>
            <pre className="overflow-x-auto whitespace-pre-wrap px-3 py-2.5 font-sans text-xs leading-relaxed text-gray-800">
              {text}
            </pre>
          </div>
        )
      })}

      <p className="flex items-start gap-1.5 px-1 text-xs text-gray-500">
        <MessageCircle size={13} className="mt-0.5 flex-shrink-0" />
        Copy each message and paste it into that supplier&apos;s WhatsApp group. Prices aren&apos;t
        included — those go on the bill message once the goods arrive.
      </p>
    </div>
  )
}
