'use client'

import { useState } from 'react'
import { Copy, Check, MessageCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from '@/lib/toast'
import { buildBillMessage, applyTemplate } from '@/lib/kitchen/messages'
import type { PricedLine } from '@/lib/kitchen/messages'

/**
 * The bill message — what goes back to the supplier's group once the goods
 * are weighed and priced.
 *
 * This is the half of the conversation the module was missing: the order
 * message goes out with no prices, and the reply that settles what is owed
 * was being typed by hand every night. The line shape reproduces what those
 * groups already receive ("Chicken sonali (40 pcs( 31x335) = 10,385"), because
 * a supplier reading at a glance should not have to learn a new format.
 *
 * Rejected quantities are excluded from the priced lines by the caller — you
 * pay for what you kept — but shown underneath, so the difference between the
 * memo in the supplier's hand and this total is explained rather than argued.
 */
export function BillMessage({
  receiptNo, supplyDate, eventDate, requisitionNo, isEmergency,
  lines, template, rejected,
}: {
  receiptNo:     string
  supplyDate:    string
  eventDate:     string
  requisitionNo: string
  isEmergency?:  boolean
  lines:         PricedLine[]
  template:      string | null
  rejected:      Array<{ item_name: string; qty: number; reason: string | null }>
}) {
  const [copied, setCopied] = useState(false)

  const fallback = buildBillMessage({
    receiptNo, supplyDate, eventDate, requisitionNo, isEmergency, lines,
  })
  const total = lines.reduce((s, l) => s + l.amount, 0)
  const text = applyTemplate(template, {
    receipt_no:     receiptNo,
    supply_date:    supplyDate,
    event_date:     eventDate,
    requisition_no: requisitionNo,
    total:          String(Math.round(total)),
    lines:          lines.map((l) => `${l.item_name} : ${l.qty} @ ${l.rate} = ${l.amount}`).join('\n'),
  }, fallback)

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'; ta.style.opacity = '0'
      document.body.appendChild(ta); ta.select()
      try { document.execCommand('copy') } finally { document.body.removeChild(ta) }
    }
    setCopied(true)
    toast.success('Bill copied — paste it into the group')
    setTimeout(() => setCopied(false), 2500)
  }

  return (
    <div className="overflow-hidden rounded-xl border border-forest-200 bg-white">
      <div className="flex items-center justify-between gap-2 border-b border-forest-100 bg-forest-50 px-3 py-2">
        <p className="text-sm font-semibold text-forest-900">Bill message</p>
        <button
          type="button" onClick={copy}
          className={cn(
            'inline-flex min-h-[38px] flex-shrink-0 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold text-white transition-colors',
            copied ? 'bg-green-600' : 'bg-[#25D366] hover:bg-[#1ebe5d]',
          )}
        >
          {copied ? <><Check size={13} /> Copied</> : <><Copy size={13} /> Copy bill</>}
        </button>
      </div>
      <pre className="overflow-x-auto whitespace-pre-wrap px-3 py-2.5 font-sans text-xs leading-relaxed text-gray-800">
        {text}
      </pre>
      {rejected.length > 0 && (
        <div className="border-t border-gray-100 bg-amber-50/50 px-3 py-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-800">
            Not billed — returned
          </p>
          <ul className="mt-0.5 space-y-0.5">
            {rejected.map((r, i) => (
              <li key={i} className="text-xs text-amber-900">
                {r.item_name} — {r.qty}{r.reason ? ` (${r.reason})` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="flex items-start gap-1.5 border-t border-gray-100 px-3 py-2 text-[11px] text-gray-500">
        <MessageCircle size={12} className="mt-0.5 flex-shrink-0" />
        Paste this into the supplier&apos;s group so both sides agree the amount before it
        gets paid.
      </p>
    </div>
  )
}
