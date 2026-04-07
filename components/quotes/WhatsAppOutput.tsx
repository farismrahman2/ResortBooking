'use client'

import { useState, useMemo } from 'react'
import { Copy, Check, Eye, EyeOff } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { formatWhatsApp } from '@/lib/formatters/whatsapp'
import type { QuoteWithRooms, SettingsMap } from '@/lib/supabase/types'
import type { WhatsAppParams } from '@/lib/formatters/whatsapp'

interface WhatsAppOutputProps {
  quote: QuoteWithRooms
  settings: SettingsMap
  roomAvailableAfterNoon?: boolean
}

export function WhatsAppOutput({ quote, settings, roomAvailableAfterNoon }: WhatsAppOutputProps) {
  const [copied, setCopied] = useState(false)
  const [showPreview, setShowPreview] = useState(false)

  const text = useMemo<string>(() => {
    // Map each room row to WhatsAppParams rooms shape, pulling unit_price from
    // either the room row itself (already stored) or falling back to snapshot prices
    const rooms: WhatsAppParams['rooms'] = quote.rooms.map((r) => {
      const snapshotPrice = quote.package_snapshot.room_prices?.[r.room_type] ?? r.unit_price
      // display_name is not on QuoteRoomRow; derive it from room_type
      const displayName = roomTypeLabel(r.room_type)
      return {
        display_name: displayName,
        qty:          r.qty,
        unit_price:   r.unit_price ?? snapshotPrice,
        nights:       quote.nights ?? null,
      }
    })

    const params: WhatsAppParams = {
      type:                'quotation',
      referenceNumber:     quote.quote_number,
      packageName:         quote.package_snapshot.name,
      customerName:        quote.customer_name,
      customerPhone:       quote.customer_phone,
      packageType:         quote.package_type,
      visitDate:           quote.visit_date,
      checkOutDate:        quote.check_out_date,
      checkIn:             quote.package_snapshot.check_in,
      checkOut:            quote.package_snapshot.check_out,
      rooms,
      adults:              quote.adults,
      childrenPaid:        quote.children_paid,
      childrenFree:        quote.children_free,
      drivers:             quote.drivers,
      lineItems:           quote.line_items,
      subtotal:            quote.subtotal,
      discount:            quote.discount,
      total:               quote.total,
      advanceRequired:     quote.advance_required,
      advancePaid:         quote.advance_paid,
      remaining:           quote.remaining,
      mealsText:           quote.package_snapshot.meals,
      notesText:           quote.customer_notes ?? quote.package_snapshot.notes,
      contactNumbers:         settings['contact_numbers']      ?? '',
      paymentInstructions:    settings['payment_instructions'] ?? '',
      footerText:             settings['whatsapp_footer_text'] ?? '',
      roomAvailableAfterNoon: roomAvailableAfterNoon ?? false,
    }

    return formatWhatsApp(params)
  }, [quote, settings])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
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
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-700">WhatsApp Message</span>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowPreview((v) => !v)}
            className="gap-1.5"
          >
            {showPreview ? <EyeOff size={14} /> : <Eye size={14} />}
            {showPreview ? 'Raw' : 'Preview'}
          </Button>
          <Button
            variant={copied ? 'secondary' : 'primary'}
            size="sm"
            onClick={handleCopy}
            className="gap-1.5 min-w-[140px]"
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? 'Copied!' : 'Copy to WhatsApp'}
          </Button>
        </div>
      </div>

      {/* Content */}
      {showPreview ? (
        <PreviewPane text={text} />
      ) : (
        <pre className="scrollable max-h-[520px] overflow-y-auto whitespace-pre-wrap break-words rounded-lg border border-gray-200 bg-gray-50 p-4 font-mono text-xs leading-relaxed text-gray-800">
          {text}
        </pre>
      )}
    </div>
  )
}

// ─── Styled HTML preview ──────────────────────────────────────────────────────

function PreviewPane({ text }: { text: string }) {
  // Convert WhatsApp markdown-lite to HTML for a styled preview:
  // *bold* → <strong>, new lines → <br />, ━━ lines → <hr />
  const html = text
    .split('\n')
    .map((line) => {
      if (/^━+$/.test(line.trim())) {
        return '<hr class="border-green-200 my-1" />'
      }
      if (/^─+$/.test(line.trim())) {
        return '<hr class="border-gray-200 my-0.5" />'
      }
      // bold: *text*
      const formatted = line.replace(/\*([^*]+)\*/g, '<strong>$1</strong>')
      return `<span>${formatted}</span>`
    })
    .join('<br />')

  return (
    <div
      className="scrollable max-h-[520px] overflow-y-auto rounded-lg border border-green-100 bg-[#e5ddd5] p-4"
    >
      {/* Simulate a WhatsApp bubble */}
      <div className="inline-block max-w-full rounded-lg bg-white px-3 py-2 shadow-sm">
        <div
          className="whitespace-pre-wrap font-sans text-[13px] leading-relaxed text-gray-900"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    </div>
  )
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function roomTypeLabel(roomType: string): string {
  const labels: Record<string, string> = {
    cottage:         'Cottage',
    eco_deluxe:      'Eco Deluxe',
    deluxe:          'Deluxe',
    premium_deluxe:  'Premium Deluxe',
    premium:         'Premium',
    super_premium:   'Super Premium',
    tree_house:      'Tree House',
  }
  return labels[roomType] ?? roomType
}
