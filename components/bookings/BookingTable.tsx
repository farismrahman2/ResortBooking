'use client'

import Link from 'next/link'
import { Eye } from 'lucide-react'
import { StatusBadge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { formatBDT } from '@/lib/formatters/currency'
import { formatDate, computeNights } from '@/lib/formatters/dates'
import type { BookingWithRooms, RoomType } from '@/lib/supabase/types'
import { WhatsAppLink } from '@/components/ui/WhatsAppLink'

const ROOM_LABELS: Record<RoomType, string> = {
  cottage:        'Cottage',
  eco_deluxe:     'Eco Deluxe',
  deluxe:         'Deluxe',
  premium_deluxe: 'Premium Deluxe',
  premium:        'Premium',
  super_premium:  'Super Premium',
  tree_house:     'Tree House',
}

interface BookingTableProps {
  bookings: BookingWithRooms[]
}

export function BookingTable({ bookings }: BookingTableProps) {
  if (bookings.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="mb-3 text-4xl">📋</div>
        <p className="text-base font-semibold text-gray-700">No bookings found</p>
        <p className="mt-1 text-sm text-gray-500">
          Adjust your filters or convert a confirmed quote to create a booking.
        </p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50 text-left">
            <Th>Booking #</Th>
            <Th>Customer</Th>
            <Th>Dates</Th>
            <Th>Rooms</Th>
            <Th>Package</Th>
            <Th className="text-right">Total</Th>
            <Th className="text-right">Remaining</Th>
            <Th className="text-center">Status</Th>
            <Th className="text-center">Actions</Th>
          </tr>
        </thead>
        <tbody>
          {bookings.map((booking) => {
            const totalGuests = booking.adults + booking.children_paid + booking.children_free
            const roomsSummary = (booking.rooms ?? [])
              .filter((r) => r.qty > 0)
              .map((r) => `${ROOM_LABELS[r.room_type] ?? r.room_type} ×${r.qty}`)
              .join(', ')

            return (
              <tr
                key={booking.id}
                className="border-b border-gray-100 transition-colors hover:bg-gray-50"
              >
                {/* Booking # */}
                <td className="px-4 py-3">
                  <Link
                    href={`/bookings/${booking.id}`}
                    className="font-mono text-xs font-semibold text-forest-700 hover:underline"
                  >
                    {booking.booking_number}
                  </Link>
                </td>

                {/* Customer + guest count */}
                <td className="px-4 py-3">
                  <p className="font-medium text-gray-900">{booking.customer_name}</p>
                  <div className="mt-0.5 flex items-center gap-1.5">
                    <p className="text-xs text-gray-500">{booking.customer_phone}</p>
                    <WhatsAppLink phone={booking.customer_phone} size="sm" />
                  </div>
                  <p className="mt-0.5 text-xs text-gray-400">
                    {totalGuests} guest{totalGuests !== 1 ? 's' : ''}
                    {booking.adults > 0 && ` (${booking.adults}A`}
                    {booking.children_paid > 0 && ` ${booking.children_paid}C`}
                    {booking.children_free > 0 && ` ${booking.children_free}F`}
                    {booking.adults > 0 && ')'}
                  </p>
                </td>

                {/* Dates */}
                <td className="px-4 py-3 text-gray-700 whitespace-nowrap">
                  {booking.package_type === 'night' && booking.check_out_date ? (
                    <>
                      <span>{formatDate(booking.visit_date)}</span>
                      <span className="text-gray-400"> → </span>
                      <span>{formatDate(booking.check_out_date)}</span>
                      <span className="ml-1 text-xs text-gray-400">
                        ({computeNights(booking.visit_date, booking.check_out_date)}N)
                      </span>
                    </>
                  ) : (
                    formatDate(booking.visit_date)
                  )}
                </td>

                {/* Rooms */}
                <td className="px-4 py-3">
                  {roomsSummary ? (
                    <p className="text-xs text-gray-700 leading-relaxed">{roomsSummary}</p>
                  ) : (
                    <p className="text-xs text-gray-400 italic">Not assigned</p>
                  )}
                </td>

                {/* Package name + type badge */}
                <td className="px-4 py-3">
                  <p className="text-xs font-medium text-gray-700 leading-snug">
                    {(booking.package_snapshot as any)?.name ?? '—'}
                  </p>
                  <span
                    className={
                      booking.package_type === 'night'
                        ? 'mt-0.5 inline-flex rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-medium text-indigo-700'
                        : 'mt-0.5 inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700'
                    }
                  >
                    {booking.package_type === 'night' ? 'Overnight' : 'Daylong'}
                  </span>
                </td>

                {/* Total */}
                <td className="px-4 py-3 text-right font-mono font-semibold text-gray-900 whitespace-nowrap">
                  {formatBDT(booking.total)}
                </td>

                {/* Remaining */}
                <td className="px-4 py-3 text-right font-mono whitespace-nowrap">
                  {booking.remaining > 0 ? (
                    <span className="font-semibold text-red-600">{formatBDT(booking.remaining)}</span>
                  ) : (
                    <span className="font-medium text-green-600">Paid</span>
                  )}
                </td>

                {/* Status */}
                <td className="px-4 py-3 text-center">
                  <StatusBadge status={booking.status} />
                </td>

                {/* Actions */}
                <td className="px-4 py-3 text-center">
                  <Link href={`/bookings/${booking.id}`}>
                    <Button variant="ghost" size="sm" className="gap-1">
                      <Eye size={13} />
                      View
                    </Button>
                  </Link>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function Th({ children, className = '' }: { children?: React.ReactNode; className?: string }) {
  return (
    <th className={`px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500 ${className}`}>
      {children}
    </th>
  )
}
