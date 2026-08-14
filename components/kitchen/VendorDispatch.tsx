'use client'

import { useState } from 'react'
import { Copy, Check, MessageCircle, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from '@/lib/toast'
import { buildOrderMessage } from '@/lib/kitchen/messages'
import type { KitchenRequisition, VendorSection } from '@/lib/supabase/types-kitchen'

/**
 * The fan-out screen. One card per vendor, each with the exact message to
 * paste into that vendor's WhatsApp group.
 *
 * Vendors with nothing to supply still get a card containing "No order" —
 * the groups already post that, and silence would be indistinguishable from
 * a message that failed to send.
 */
export function VendorDispatch({
  requisition, sections,
}: {
  requisition: Pick<KitchenRequisition, 'requisition_no' | 'event_date' | 'is_emergency'>
  sections: VendorSection[]
}) {
  const [copied, setCopied] = useState<string | null>(null)

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
        const text  = buildOrderMessage(requisition, s)
        const empty = s.lines.length === 0
        const isCopied = copied === s.vendor.id
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
                {isCopied ? <><Check size={13} /> Copied</> : <><Copy size={13} /> Copy message</>}
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
