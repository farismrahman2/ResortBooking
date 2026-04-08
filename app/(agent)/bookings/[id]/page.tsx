import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Printer } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { StatusBadge } from '@/components/ui/Badge'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import { BookingActions } from '@/components/bookings/BookingActions'
import { BookingWhatsAppOutput } from '@/components/bookings/BookingWhatsAppOutput'
import { getBookingById } from '@/lib/queries/bookings'
import { getSettings, getHolidayDateStrings, getRoomInventory } from '@/lib/queries/settings'
import { WhatsAppLink } from '@/components/ui/WhatsAppLink'
import { getBookedRoomNumbers } from '@/lib/queries/availability'
import { createClient } from '@/lib/supabase/server'
import { formatDate, formatDateRange } from '@/lib/formatters/dates'
import { formatBDT } from '@/lib/formatters/currency'
import type { RoomType } from '@/lib/supabase/types'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: { id: string }
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

export default async function BookingDetailPage({ params }: PageProps) {
  const [booking, settings, holidayDates, inventory] = await Promise.all([
    getBookingById(params.id),
    getSettings(),
    getHolidayDateStrings(),
    getRoomInventory(),
  ])

  // Room numbers already taken by OTHER bookings for the same date range
  const bookedRoomNumbers = booking
    ? await getBookedRoomNumbers(booking.visit_date, booking.check_out_date, params.id)
    : []

  if (!booking) notFound()

  // Check if any selected rooms have a night stay checking out on the visit date
  let roomAvailableAfterNoon = false
  if (booking.package_type === 'daylong' && booking.rooms.length > 0) {
    const supabase  = createClient()
    const roomTypes = booking.rooms.map((r) => r.room_type)
    const { data } = await supabase
      .from('booking_rooms')
      .select('room_type, bookings!inner(check_out_date, status)')
      .eq('bookings.check_out_date', booking.visit_date)
      .neq('bookings.status', 'cancelled')
      .in('room_type', roomTypes)
    if (data && data.length > 0) roomAvailableAfterNoon = true
  }

  const snap = booking.package_snapshot

  const dateLine =
    booking.package_type === 'night' && booking.check_out_date
      ? formatDateRange(booking.visit_date, booking.check_out_date)
      : formatDate(booking.visit_date)

  return (
    <div className="flex h-full flex-col">
      <Topbar
        title={booking.booking_number}
        subtitle={booking.customer_name}
      />

      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
        {/* Status row */}
        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge status={booking.status} />
          <span className="text-xs text-gray-500">
            Created {formatDate(booking.created_at.slice(0, 10))}
          </span>
          <div className="ml-auto">
            <Link
              href={`/bookings/${booking.id}/print`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <Printer size={13} />
              Print
            </Link>
          </div>
        </div>

        {/* Two-column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* LEFT column */}
          <div className="space-y-5">

            {/* 1. Booking Info */}
            <Card>
              <CardHeader>
                <CardTitle>Booking Info</CardTitle>
              </CardHeader>
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-xs font-medium text-gray-500">Package</dt>
                  <dd className="mt-0.5 font-medium text-gray-900">{snap.name}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-gray-500">Type</dt>
                  <dd className="mt-0.5">
                    <span
                      className={
                        booking.package_type === 'night'
                          ? 'inline-flex rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700'
                          : 'inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700'
                      }
                    >
                      {booking.package_type === 'night' ? 'Overnight' : 'Daylong'}
                    </span>
                  </dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-xs font-medium text-gray-500">Date(s)</dt>
                  <dd className="mt-0.5 text-gray-900">{dateLine}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-gray-500">Check-in</dt>
                  <dd className="mt-0.5 font-mono text-gray-900">{snap.check_in}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-gray-500">Check-out</dt>
                  <dd className="mt-0.5 font-mono text-gray-900">{snap.check_out}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-gray-500">Customer Phone</dt>
                  <dd className="mt-0.5 flex items-center gap-2">
                    <span className="text-gray-900">{booking.customer_phone}</span>
                    <WhatsAppLink phone={booking.customer_phone} />
                  </dd>
                </div>
                {booking.customer_notes && (
                  <div className="col-span-2">
                    <dt className="text-xs font-medium text-gray-500">Notes</dt>
                    <dd className="mt-0.5 text-gray-700 whitespace-pre-wrap">{booking.customer_notes}</dd>
                  </div>
                )}
              </dl>
            </Card>

            {/* 2. Guests */}
            <Card>
              <CardHeader>
                <CardTitle>Guests</CardTitle>
              </CardHeader>
              <div className="grid grid-cols-3 gap-3 text-sm">
                <GuestStat label="Adults" value={booking.adults} />
                <GuestStat label="Children (paid)" value={booking.children_paid} />
                <GuestStat label="Children (free)" value={booking.children_free} />
                <GuestStat label="Drivers" value={booking.drivers} />
                {booking.package_type === 'night' && (
                  <GuestStat label="Extra Beds" value={booking.extra_beds} />
                )}
              </div>
            </Card>

            {/* 3. Rooms */}
            <Card>
              <CardHeader>
                <CardTitle>Rooms</CardTitle>
              </CardHeader>
              <div className="space-y-2">
                {booking.rooms.length === 0 ? (
                  <p className="text-sm text-gray-400">No rooms recorded</p>
                ) : (
                  booking.rooms.map((r) => {
                    const snapshotPrice = snap.room_prices?.[r.room_type] ?? r.unit_price
                    const nights = booking.nights ?? 1
                    const subtotal =
                      booking.package_type === 'night'
                        ? r.qty * r.unit_price * nights
                        : r.qty * r.unit_price
                    return (
                      <div
                        key={r.id}
                        className="rounded-lg border border-gray-100 bg-gray-50 px-4 py-2"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-gray-800">
                            {ROOM_LABELS[r.room_type] ?? r.room_type.replace(/_/g, ' ')}
                          </span>
                          <div className="flex items-center gap-4 text-sm text-gray-600">
                            <span>×{r.qty}</span>
                            <span className="font-mono">{formatBDT(r.unit_price)}/rm</span>
                            {booking.nights && (
                              <span className="text-xs text-gray-400">×{booking.nights}N</span>
                            )}
                            <span className="font-semibold text-gray-900 font-mono">
                              {formatBDT(subtotal)}
                            </span>
                          </div>
                        </div>
                        {r.room_numbers && r.room_numbers.length > 0 && (
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {r.room_numbers.map((num) => (
                              <span
                                key={num}
                                className="inline-flex items-center rounded bg-forest-100 px-2 py-0.5 text-xs font-mono font-semibold text-forest-700"
                              >
                                #{num}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })
                )}
              </div>
            </Card>

            {/* 4. Pricing */}
            <Card>
              <CardHeader>
                <CardTitle>Pricing Breakdown</CardTitle>
              </CardHeader>
              <div className="overflow-hidden rounded-lg border border-gray-200">
                {/* Line items table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                        <th className="py-2 pl-4 pr-3 text-left font-medium">Item</th>
                        <th className="py-2 px-2 text-right font-medium">Qty</th>
                        <th className="py-2 px-2 text-right font-medium">Unit</th>
                        <th className="py-2 px-2 text-right font-medium">Nights</th>
                        <th className="py-2 pl-2 pr-4 text-right font-medium">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {booking.line_items.map((item, i) => (
                        <tr key={i} className="hover:bg-gray-50/50">
                          <td className="py-2 pl-4 pr-3 text-gray-800">{item.label}</td>
                          <td className="py-2 px-2 text-right tabular-nums text-gray-600">
                            {item.qty}
                          </td>
                          <td className="py-2 px-2 text-right tabular-nums text-gray-600 text-xs">
                            {formatBDT(item.unit_price)}
                          </td>
                          <td className="py-2 px-2 text-right tabular-nums text-gray-500 text-xs">
                            {item.nights ?? '—'}
                          </td>
                          <td className="py-2 pl-2 pr-4 text-right tabular-nums font-medium text-gray-800">
                            {formatBDT(item.subtotal)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Totals */}
                <div className="border-t border-gray-200 bg-gray-50/50 px-4 py-3 space-y-1.5">
                  <PricingRow label="Subtotal" value={formatBDT(booking.subtotal)} />
                  {booking.discount > 0 && (
                    <PricingRow label="Discount" value={`-${formatBDT(booking.discount)}`} className="text-red-600" />
                  )}
                  <PricingRow label="Total" value={formatBDT(booking.total)} bold highlight />
                  <div className="my-1 border-t border-gray-200" />
                  <PricingRow label="Advance Required" value={formatBDT(booking.advance_required)} />
                  <PricingRow label="Advance Paid" value={formatBDT(booking.advance_paid)} />
                  <PricingRow
                    label="Remaining"
                    value={formatBDT(booking.remaining)}
                    bold
                    highlight
                    valueClassName={booking.remaining > 0 ? 'text-red-600' : 'text-green-600'}
                  />
                </div>
              </div>
            </Card>

            {/* 5. Actions */}
            <Card>
              <CardHeader>
                <CardTitle>Actions</CardTitle>
              </CardHeader>
              <BookingActions booking={booking} holidayDates={holidayDates} inventory={inventory} bookedRoomNumbers={bookedRoomNumbers} />
            </Card>
          </div>

          {/* RIGHT column */}
          <div className="space-y-5">
            {/* WhatsApp output */}
            <Card>
              <BookingWhatsAppOutput booking={booking} settings={settings} roomAvailableAfterNoon={roomAvailableAfterNoon} />
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

function PricingRow({
  label,
  value,
  bold = false,
  highlight = false,
  className = '',
  valueClassName = '',
}: {
  label: string
  value: string
  bold?: boolean
  highlight?: boolean
  className?: string
  valueClassName?: string
}) {
  return (
    <div
      className={`flex items-center justify-between px-1 py-0.5 rounded text-sm ${
        highlight ? 'bg-forest-50 border border-forest-100' : ''
      } ${className}`}
    >
      <span className={bold ? 'font-semibold text-gray-900' : 'text-gray-600'}>
        {label}
      </span>
      <span
        className={`font-mono ${bold ? 'font-bold' : 'font-medium'} ${
          valueClassName || (highlight ? 'text-forest-700' : 'text-gray-800')
        }`}
      >
        {value}
      </span>
    </div>
  )
}
