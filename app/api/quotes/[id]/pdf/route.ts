import { NextResponse } from 'next/server'
import { renderToBuffer } from '@react-pdf/renderer'
import { getQuoteById } from '@/lib/queries/quotes'
import { getSettings, getRoomInventory } from '@/lib/queries/settings'
import { hasPermission } from '@/lib/auth/permissions'
import { QuotationPdfDocument } from '@/lib/pdf/quotation'
import { buildQuotationPdfInput } from '@/lib/pdf/quotation-builder'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/quotes/[id]/pdf — streams a draft-preview PDF rendered from
 * the quote's current data. Always renders fresh; never cached. The
 * "Refresh" pattern is just clicking the button again.
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  if (!(await hasPermission('bookings', 'read'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const [quote, settings, inventory] = await Promise.all([
    getQuoteById(params.id),
    getSettings(),
    getRoomInventory(),
  ])
  if (!quote) return NextResponse.json({ error: 'Quote not found' }, { status: 404 })

  const input = buildQuotationPdfInput({
    source: quote,
    kind: 'quotation',
    isDraftPreview: quote.status === 'draft' || quote.status === 'sent',
    settings,
    inventory,
  })

  const buffer = await renderToBuffer(QuotationPdfDocument(input))
  const filename = `GCR-quote-${quote.quote_number || quote.id.slice(0, 8)}.pdf`
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
