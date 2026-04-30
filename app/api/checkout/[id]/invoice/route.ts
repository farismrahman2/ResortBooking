import { NextResponse } from 'next/server'
import { renderToBuffer } from '@react-pdf/renderer'
import { Invoice } from '@/lib/pdf/invoice'
import { createClient } from '@/lib/supabase/server'
import { getSettings } from '@/lib/queries/settings'
import { getCurrentUserContext, hasPermission } from '@/lib/auth/permissions'
import {
  getCheckoutFull,
  getChargesByCheckout,
  getPaymentsByCheckout,
} from '@/lib/queries/checkout'

interface RouteParams {
  params: { id: string }
}

/**
 * GET /api/checkout/[bookingId]/invoice — streams the PDF invoice for a booking's checkout.
 * Permission: requires 'read' on checkout. Middleware already enforces auth.
 */
export async function GET(_req: Request, { params }: RouteParams) {
  if (!(await hasPermission('checkout', 'read'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const bookingId = params.id
  const checkout = await getCheckoutFull(bookingId)
  if (!checkout) {
    return NextResponse.json({ error: 'Checkout not found' }, { status: 404 })
  }

  // For drafts, we still allow PDF preview but we should compute current totals
  // (the snapshot in `checkouts.charges_total` is only set at finalize time).
  if (checkout.status === 'draft') {
    const [charges, payments] = await Promise.all([
      getChargesByCheckout(checkout.id),
      getPaymentsByCheckout(checkout.id),
    ])
    checkout.charges = charges
    checkout.payments = payments
    checkout.charges_total  = charges.reduce((s, c) => s + Number(c.amount), 0)
    checkout.payments_total = payments.reduce((s, p) => s + Number(p.amount), 0)
    checkout.advance_amount = Number(checkout.booking.advance_paid)
  }

  const settings = await getSettings()
  const ctx = await getCurrentUserContext()

  // Pull resort identity from settings (with sensible fallbacks)
  const resortName    = (settings as any).resort_name    ?? 'Garden Centre Resort'
  const resortAddress = (settings as any).resort_address ?? 'Sreemangal, Bangladesh'
  const resortPhone   = (settings as any).contact_numbers ?? ''
  const resortEmail   = (settings as any).contact_email   ?? undefined

  const buffer = await renderToBuffer(
    Invoice({
      checkout,
      resortName,
      resortAddress,
      resortPhone,
      resortEmail,
      issuedBy: ctx?.profile.full_name ?? ctx?.email ?? null,
    }),
  )

  const filename = `GCR-invoice-${checkout.id.slice(0, 8).toUpperCase()}.pdf`
  return new NextResponse(buffer as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type':         'application/pdf',
      'Content-Disposition':  `inline; filename="${filename}"`,
      'Content-Length':       String(buffer.length),
      'Cache-Control':        'no-store',
    },
  })
}
