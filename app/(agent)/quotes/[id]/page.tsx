import { notFound } from 'next/navigation'
import { Topbar } from '@/components/layout/Topbar'
import { StatusBadge } from '@/components/ui/Badge'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import { PricingBreakdown } from '@/components/quotes/PricingBreakdown'
import { QuoteActions } from '@/components/quotes/QuoteActions'
import { WhatsAppOutput } from '@/components/quotes/WhatsAppOutput'
import { getQuoteById } from '@/lib/queries/quotes'
import { getSettings } from '@/lib/queries/settings'
import { formatDate, formatDateRange } from '@/lib/formatters/dates'
import { WhatsAppLink } from '@/components/ui/WhatsAppLink'
import { formatBDT } from '@/lib/formatters/currency'
import type { CalculationResult } from '@/lib/engine/calculator'
import type { LineItem } from '@/lib/supabase/types'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: { id: string }
}

export default async function QuoteDetailPage({ params }: PageProps) {
  const [quote, settings] = await Promise.all([
    getQuoteById(params.id),
    getSettings(),
  ])

  if (!quote) notFound()

  // Build a CalculationResult from stored data (no recalculation)
  const storedResult: CalculationResult = {
    line_items:       quote.line_items as LineItem[],
    subtotal:         quote.subtotal,
    discount:         quote.discount,
    total:            quote.total,
    advance_required: quote.advance_required,
    advance_paid:     quote.advance_paid,
    due_advance:      quote.due_advance,
    remaining:        quote.remaining,
    adult_rate_used:  'weekday',
    nights:           quote.nights,
  }

  const snap = quote.package_snapshot

  const dateLine =
    quote.package_type === 'night' && quote.check_out_date
      ? formatDateRange(quote.visit_date, quote.check_out_date)
      : formatDate(quote.visit_date)

  return (
    <div className="flex h-full flex-col">
      <Topbar
        title={`Quote ${quote.quote_number}`}
        subtitle={`Created ${formatDate(quote.created_at)}`}
        action={{ label: 'New Quote', href: '/quotes/new' }}
      />

      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
        {/* Header row: status + actions */}
        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge status={quote.status} />
          <QuoteActions
            quote={quote}
            bookingId={quote.converted_to_booking_id ?? undefined}
          />
        </div>

        {/* Two-column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* LEFT column */}
          <div className="space-y-5">

            {/* Customer info */}
            <Card>
              <CardHeader>
                <CardTitle>Customer</CardTitle>
              </CardHeader>
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-xs font-medium text-gray-500">Name</dt>
                  <dd className="mt-0.5 font-medium text-gray-900">{quote.customer_name}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-gray-500">Phone</dt>
                  <dd className="mt-0.5 flex items-center gap-2">
                    <span className="font-medium text-gray-900">{quote.customer_phone}</span>
                    <WhatsAppLink phone={quote.customer_phone} />
                  </dd>
                </div>
                {quote.customer_notes && (
                  <div className="col-span-2">
                    <dt className="text-xs font-medium text-gray-500">Notes</dt>
                    <dd className="mt-0.5 text-gray-700 whitespace-pre-wrap">{quote.customer_notes}</dd>
                  </div>
                )}
              </dl>
            </Card>

            {/* Package info */}
            <Card>
              <CardHeader>
                <CardTitle>Package</CardTitle>
              </CardHeader>
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-xs font-medium text-gray-500">Package</dt>
                  <dd className="mt-0.5 font-medium text-gray-900">{snap.name}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-gray-500">Type</dt>
                  <dd className="mt-0.5 capitalize text-gray-900">{quote.package_type}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-gray-500">Date(s)</dt>
                  <dd className="mt-0.5 text-gray-900">{dateLine}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-gray-500">Timing</dt>
                  <dd className="mt-0.5 text-gray-900">
                    {snap.check_in} → {snap.check_out}
                  </dd>
                </div>
                {snap.meals && (
                  <div className="col-span-2">
                    <dt className="text-xs font-medium text-gray-500">Meals</dt>
                    <dd className="mt-0.5 text-gray-700">{snap.meals}</dd>
                  </div>
                )}
                {snap.activities && (
                  <div className="col-span-2">
                    <dt className="text-xs font-medium text-gray-500">Activities</dt>
                    <dd className="mt-0.5 text-gray-700">{snap.activities}</dd>
                  </div>
                )}
              </dl>
            </Card>

            {/* Guests */}
            <Card>
              <CardHeader>
                <CardTitle>Guests</CardTitle>
              </CardHeader>
              <div className="grid grid-cols-3 gap-3 text-sm">
                <GuestStat label="Adults" value={quote.adults} />
                <GuestStat label="Children (paid)" value={quote.children_paid} />
                <GuestStat label="Children (free)" value={quote.children_free} />
                <GuestStat label="Drivers" value={quote.drivers} />
                {quote.package_type === 'night' && (
                  <GuestStat label="Extra Beds" value={quote.extra_beds} />
                )}
              </div>
            </Card>

            {/* Rooms */}
            <Card>
              <CardHeader>
                <CardTitle>Rooms</CardTitle>
              </CardHeader>
              <div className="space-y-2">
                {quote.rooms.length === 0 ? (
                  <p className="text-sm text-gray-400">No rooms recorded</p>
                ) : (
                  quote.rooms.map((r) => (
                    <div
                      key={r.id}
                      className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-4 py-2"
                    >
                      <span className="text-sm font-medium text-gray-800 capitalize">
                        {r.room_type.replace(/_/g, ' ')}
                      </span>
                      <div className="flex items-center gap-4 text-sm text-gray-600">
                        <span>×{r.qty}</span>
                        <span className="font-mono">{formatBDT(r.unit_price)}/rm</span>
                        {quote.nights && (
                          <span className="text-xs text-gray-400">×{quote.nights}N</span>
                        )}
                        <span className="font-semibold text-gray-900 font-mono">
                          {formatBDT(r.unit_price * r.qty * (quote.nights ?? 1))}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </Card>
          </div>

          {/* RIGHT column */}
          <div className="space-y-5">
            {/* Pricing breakdown */}
            <Card>
              <CardHeader>
                <CardTitle>Pricing Breakdown</CardTitle>
              </CardHeader>
              <PricingBreakdown result={storedResult} />
            </Card>

            {/* WhatsApp output */}
            <Card>
              <WhatsAppOutput quote={quote} settings={settings} />
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Small helpers ─────────────────────────────────────────────────────────────

function GuestStat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p className="mt-0.5 text-lg font-semibold text-gray-900 tabular-nums">{value}</p>
    </div>
  )
}
