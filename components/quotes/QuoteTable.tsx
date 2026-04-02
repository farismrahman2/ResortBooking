'use client'

import Link from 'next/link'
import { Eye } from 'lucide-react'
import { StatusBadge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { formatBDT } from '@/lib/formatters/currency'
import { formatDate } from '@/lib/formatters/dates'
import type { QuoteRow } from '@/lib/supabase/types'
import { WhatsAppLink } from '@/components/ui/WhatsAppLink'

interface QuoteTableProps {
  quotes: QuoteRow[]
}

export function QuoteTable({ quotes }: QuoteTableProps) {
  if (quotes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="mb-3 text-4xl">🗒️</div>
        <p className="text-base font-semibold text-gray-700">No quotes found</p>
        <p className="mt-1 text-sm text-gray-500">
          Adjust your filters or create a new quote to get started.
        </p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50 text-left">
            <Th>Quote #</Th>
            <Th>Customer</Th>
            <Th>Date</Th>
            <Th>Package</Th>
            <Th className="text-right">Amount</Th>
            <Th className="text-right">Advance Due</Th>
            <Th className="text-center">Status</Th>
            <Th className="text-center">Actions</Th>
          </tr>
        </thead>
        <tbody>
          {quotes.map((quote) => (
            <tr
              key={quote.id}
              className="border-b border-gray-100 transition-colors hover:bg-gray-50"
            >
              {/* Quote # */}
              <td className="px-4 py-3">
                <Link
                  href={`/quotes/${quote.id}`}
                  className="font-mono text-xs font-semibold text-forest-700 hover:underline"
                >
                  {quote.quote_number}
                </Link>
              </td>

              {/* Customer */}
              <td className="px-4 py-3">
                <p className="font-medium text-gray-900">{quote.customer_name}</p>
                <div className="mt-0.5 flex items-center gap-1.5">
                  <p className="text-xs text-gray-500">{quote.customer_phone}</p>
                  <WhatsAppLink phone={quote.customer_phone} size="sm" />
                </div>
              </td>

              {/* Visit date */}
              <td className="px-4 py-3 text-gray-700">
                {formatDate(quote.visit_date)}
              </td>

              {/* Package type */}
              <td className="px-4 py-3">
                <span
                  className={
                    quote.package_type === 'night'
                      ? 'inline-flex rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700'
                      : 'inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700'
                  }
                >
                  {quote.package_type === 'night' ? 'Overnight' : 'Daylong'}
                </span>
              </td>

              {/* Total amount */}
              <td className="px-4 py-3 text-right font-mono font-semibold text-gray-900">
                {formatBDT(quote.total)}
              </td>

              {/* Advance due */}
              <td className="px-4 py-3 text-right font-mono">
                <span
                  className={
                    quote.due_advance > 0
                      ? 'font-semibold text-red-600'
                      : 'text-gray-500'
                  }
                >
                  {quote.due_advance > 0 ? formatBDT(quote.due_advance) : '—'}
                </span>
              </td>

              {/* Status */}
              <td className="px-4 py-3 text-center">
                <StatusBadge status={quote.status} />
              </td>

              {/* Actions */}
              <td className="px-4 py-3 text-center">
                <Link href={`/quotes/${quote.id}`}>
                  <Button variant="ghost" size="sm" className="gap-1">
                    <Eye size={13} />
                    View
                  </Button>
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function Th({
  children,
  className = '',
}: {
  children?: React.ReactNode
  className?: string
}) {
  return (
    <th className={`px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500 ${className}`}>
      {children}
    </th>
  )
}
