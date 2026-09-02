'use client'

import Link from 'next/link'
import { Eye, CalendarCheck } from 'lucide-react'
import { StatusBadge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { DataTable, type DataColumn } from '@/components/ui/DataTable'
import { formatBDT } from '@/lib/formatters/currency'
import { formatDate, computeNights } from '@/lib/formatters/dates'
import { WhatsAppLink } from '@/components/ui/WhatsAppLink'
import type { BookingWithRooms, RoomType } from '@/lib/supabase/types'

const ROOM_LABELS: Record<RoomType, string> = {
  cottage:        'Cottage',
  eco_deluxe:      'Eco Deluxe',
  deluxe:          'Deluxe',
  superior_deluxe: 'Superior Deluxe',
  premium_deluxe:  'Premium Deluxe',
  premium:        'Premium',
  super_premium:  'Super Premium',
  tree_house:     'Tree House',
}

interface BookingTableProps {
  bookings: BookingWithRooms[]
}

function roomsSummary(b: BookingWithRooms): string {
  return (b.rooms ?? [])
    .filter((r) => r.qty > 0)
    .map((r) => `${ROOM_LABELS[r.room_type] ?? r.room_type} ×${r.qty}`)
    .join(', ')
}

export function BookingTable({ bookings }: BookingTableProps) {
  const columns: DataColumn<BookingWithRooms>[] = [
    {
      key: 'customer', header: 'Customer', card: 'title',
      render: (b) => (
        <span>
          {b.customer_name}
          {(b as any).is_corporate && (
            <span
              className="ml-1.5 inline-flex items-center rounded-full bg-indigo-50 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700 align-middle"
              title={(b as any).company_name ?? 'Corporate booking'}
            >🏢 Corporate</span>
          )}
          {b.source_module === 'crm_handoff' && (
            <span className="ml-1.5 inline-flex items-center rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 align-middle">
              From CRM
            </span>
          )}
        </span>
      ),
    },
    {
      key: 'ref', header: 'Booking #', card: 'subtitle',
      render: (b) => (
        <span className="font-mono text-xs text-gray-500">
          {b.booking_number}
          {(b as any).is_corporate && (b as any).company_name ? ` · ${(b as any).company_name}` : ''}
        </span>
      ),
    },
    { key: 'status', header: 'Status', align: 'center', card: 'badge', render: (b) => <StatusBadge status={b.status} /> },
    {
      key: 'dates', header: 'Dates',
      render: (b) => (
        <span className="whitespace-nowrap text-gray-700">
          {(b.package_type === 'night' || b.package_type === 'group') && b.check_out_date ? (
            <>
              {formatDate(b.visit_date)}
              <span className="text-gray-400"> → </span>
              {formatDate(b.check_out_date)}
              <span className="ml-1 text-xs text-gray-400">({computeNights(b.visit_date, b.check_out_date)}N)</span>
            </>
          ) : formatDate(b.visit_date)}
        </span>
      ),
    },
    {
      key: 'guests', header: 'Guests',
      render: (b) => {
        const total = b.adults + b.children_paid + b.children_free
        return <span className="text-gray-700">{total} guest{total !== 1 ? 's' : ''}</span>
      },
    },
    {
      key: 'rooms', header: 'Rooms',
      render: (b) => {
        const s = roomsSummary(b)
        return s
          ? <span className="text-xs text-gray-700">{s}</span>
          : <span className="text-xs italic text-gray-400">Not assigned</span>
      },
    },
    {
      key: 'package', header: 'Package',
      render: (b) => (
        <span className="text-xs text-gray-700">{(b.package_snapshot as any)?.name ?? '—'}</span>
      ),
    },
    {
      key: 'total', header: 'Total', align: 'right',
      className: 'font-mono font-semibold text-gray-900 whitespace-nowrap',
      render: (b) => formatBDT(b.total),
    },
    {
      key: 'remaining', header: 'Remaining', align: 'right',
      className: 'font-mono whitespace-nowrap',
      render: (b) => b.remaining > 0
        ? <span className="font-semibold text-red-600">{formatBDT(b.remaining)}</span>
        : <span className="font-medium text-green-600">Paid</span>,
    },
    {
      key: 'phone', header: 'Phone', card: 'meta',
      render: (b) => (
        <span className="inline-flex items-center gap-1.5 text-xs text-gray-500">
          {b.customer_phone}
          <WhatsAppLink phone={b.customer_phone} size="sm" />
        </span>
      ),
    },
  ]

  return (
    <DataTable
      rows={bookings}
      columns={columns}
      rowKey={(b) => b.id}
      href={(b) => `/bookings/${b.id}`}
      rowClassName={(b) => (b.status === 'cancelled' ? 'opacity-60' : undefined)}
      actions={(b) => (
        <Link href={`/bookings/${b.id}`}>
          <Button variant="ghost" size="sm" className="gap-1">
            <Eye size={13} /> View
          </Button>
        </Link>
      )}
      empty={
        <EmptyState
          icon={<CalendarCheck size={26} />}
          title="No bookings found"
          description="Adjust your filters, or convert a confirmed quote to create a booking."
          action={{ label: 'Go to quotes', href: '/quotes' }}
        />
      }
    />
  )
}
