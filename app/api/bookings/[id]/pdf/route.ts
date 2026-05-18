import { NextResponse } from 'next/server'
import { renderToBuffer } from '@react-pdf/renderer'
import { getBookingById } from '@/lib/queries/bookings'
import { getSettings, getRoomInventory } from '@/lib/queries/settings'
import { hasPermission } from '@/lib/auth/permissions'
import { QuotationPdfDocument } from '@/lib/pdf/quotation'
import { buildQuotationPdfInput } from '@/lib/pdf/quotation-builder'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/bookings/[id]/pdf — streams a confirmation-style PDF rendered
 * from the booking's current data. For the post-checkout invoice with
 * extras + payments, use /api/checkout/[id]/invoice instead.
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  if (!(await hasPermission('bookings', 'read'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const [booking, settings, inventory] = await Promise.all([
    getBookingById(params.id),
    getSettings(),
    getRoomInventory(),
  ])
  if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })

  const input = buildQuotationPdfInput({
    source: booking,
    kind: 'booking',
    isDraftPreview: false,
    settings,
    inventory,
  })

  const buffer = await renderToBuffer(QuotationPdfDocument(input))
  const filename = `GCR-booking-${booking.booking_number || booking.id.slice(0, 8)}.pdf`
  return new NextResponse(buffer as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type':        'application/pdf',
      'Content-Disposition': `inline; filename="${filename}"`,
      'Content-Length':      String(buffer.length),
      'Cache-Control':       'no-store',
    },
  })
}
