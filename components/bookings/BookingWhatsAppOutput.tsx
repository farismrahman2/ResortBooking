'use client'

import { useState, useMemo } from 'react'
import { Copy, Check, Eye, EyeOff } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { formatWhatsApp } from '@/lib/formatters/whatsapp'
import type { BookingWithRooms, SettingsMap, RoomType } from '@/lib/supabase/types'
import type { WhatsAppParams } from '@/lib/formatters/whatsapp'

interface BookingWhatsAppOutputProps {
  booking:                BookingWithRooms
  settings:               SettingsMap
  roomAvailableAfterNoon?: boolean
}

const ROOM_LABELS: Record<RoomType, string> = {
  cottage:        'Cottage',
  eco_deluxe:     'Eco Deluxe',
  deluxe:         'Deluxe',
  premium_deluxe: 'Premium Deluxe',
  premium:        'Premium',
  super_premium:  'Super Premium',
  tree_house:     'Tree House',
}

export function BookingWhatsAppOutput({ booking, settings, roomAvailableAfterNoon }: BookingWhatsAppOutputProps) {
  const [copied, setCopied]           = useState(false)
  const [showPreview, setShowPreview] = useState(false)

  const text = useMemo<string>(() => {
    const snap = booking.package_snapshot

    const rooms: WhatsAppParams['rooms'] = booking.rooms.map((r) => ({
      display_name: ROOM_LABELS[r.room_type] ?? r.room_type.replace(/_/g, ' '),
      qty:          r.qty,
      unit_price:   r.unit_price,
      nights:       booking.nights ?? null,
    }))

    const params: WhatsAppParams = {
      type:                'booking_confirmation',
      referenceNumber:     booking.booking_number,
      packageName:         snap.name,
      customerName:        booking.customer_name,
      customerPhone:       booking.customer_phone,
      packageType:         booking.package_type,
      visitDate:           booking.visit_date,
      checkOutDate:        booking.check_out_date,
      checkIn:             snap.check_in,
      checkOut:            snap.check_out,
      rooms,
      adults:              booking.adults,
      childrenPaid:        booking.children_paid,
      childrenFree:        booking.children_free,
      drivers:             booking.drivers,
      lineItems:           booking.line_items,
      subtotal:            booking.subtotal,
      discount:            booking.discount,
      total:               booking.total,
      advanceRequired:     booking.advance_required,
      advancePaid:         booking.advance_paid,
      remaining:           booking.remaining,
      mealsText:           snap.meals,
      notesText:             booking.customer_notes ?? snap.notes,
      contactNumbers:        settings['contact_numbers']      ?? '',
      paymentInstructions:   settings['payment_instructions'] ?? '',
      footerText:            settings['whatsapp_footer_text'] ?? '',
      roomAvailableAfterNoon: roomAvailableAfterNoon ?? false,
    }

    return formatWhatsApp(params)
  }, [booking, settings, roomAvailableAfterNoon])

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
        <span className="text-sm font-medium text-gray-700">WhatsApp Confirmation</span>
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
  const html = text
    .split('\n')
    .map((line) => {
      if (/^━+$/.test(line.trim())) {
        return '<hr class="border-green-200 my-1" />'
      }
      if (/^─+$/.test(line.trim())) {
        return '<hr class="border-gray-200 my-0.5" />'
      }
      const formatted = line.replace(/\*([^*]+)\*/g, '<strong>$1</strong>')
      return `<span>${formatted}</span>`
    })
    .join('<br />')

  return (
    <div className="scrollable max-h-[520px] overflow-y-auto rounded-lg border border-green-100 bg-[#e5ddd5] p-4">
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
