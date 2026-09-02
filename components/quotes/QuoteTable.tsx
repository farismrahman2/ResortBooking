'use client'

import Link from 'next/link'
import { Eye, FileText } from 'lucide-react'
import { StatusBadge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { DataTable, type DataColumn } from '@/components/ui/DataTable'
import { formatBDT } from '@/lib/formatters/currency'
import { formatDate } from '@/lib/formatters/dates'
import { WhatsAppLink } from '@/components/ui/WhatsAppLink'
import type { QuoteRow } from '@/lib/supabase/types'

interface QuoteTableProps {
  quotes: QuoteRow[]
}

export function QuoteTable({ quotes }: QuoteTableProps) {
  const columns: DataColumn<QuoteRow>[] = [
    {
      key: 'customer', header: 'Customer', card: 'title',
      render: (q) => (
        <span>
          {q.customer_name}
          {(q as any).is_corporate && (
            <span
              className="ml-1.5 inline-flex items-center rounded-full bg-indigo-50 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700 align-middle"
              title={(q as any).company_name ?? 'Corporate quote'}
            >🏢 Corporate</span>
          )}
        </span>
      ),
    },
    {
      key: 'ref', header: 'Quote #', card: 'subtitle',
      render: (q) => (
        <span className="font-mono text-xs text-gray-500">
          {q.quote_number}
          {(q as any).is_corporate && (q as any).company_name ? ` · ${(q as any).company_name}` : ''}
        </span>
      ),
    },
    { key: 'status', header: 'Status', align: 'center', card: 'badge', render: (q) => <StatusBadge status={q.status} /> },
    {
      key: 'date', header: 'Visit date',
      render: (q) => <span className="whitespace-nowrap text-gray-700">{formatDate(q.visit_date)}</span>,
    },
    {
      key: 'package', header: 'Package',
      render: (q) => (
        <span className={
          q.package_type === 'night'
            ? 'inline-flex rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700'
            : q.package_type === 'group'
              ? 'inline-flex rounded-full bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-700'
              : 'inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700'
        }>
          {q.package_type === 'night' ? 'Overnight' : q.package_type === 'group' ? 'Group' : 'Daylong'}
        </span>
      ),
      hideLabel: true,
    },
    {
      key: 'total', header: 'Amount', align: 'right',
      className: 'font-mono font-semibold text-gray-900',
      render: (q) => formatBDT(q.total),
    },
    {
      key: 'advance', header: 'Advance due', align: 'right', className: 'font-mono',
      render: (q) => q.due_advance > 0
        ? <span className="font-semibold text-red-600">{formatBDT(q.due_advance)}</span>
        : <span className="text-gray-500">—</span>,
    },
    {
      key: 'phone', header: 'Phone', card: 'meta',
      render: (q) => (
        <span className="inline-flex items-center gap-1.5 text-xs text-gray-500">
          {q.customer_phone}
          <WhatsAppLink phone={q.customer_phone} size="sm" />
        </span>
      ),
    },
  ]

  return (
    <DataTable
      rows={quotes}
      columns={columns}
      rowKey={(q) => q.id}
      href={(q) => `/quotes/${q.id}`}
      rowClassName={(q) => (q.status === 'cancelled' ? 'opacity-60' : undefined)}
      actions={(q) => (
        <Link href={`/quotes/${q.id}`}>
          <Button variant="ghost" size="sm" className="gap-1">
            <Eye size={13} /> View
          </Button>
        </Link>
      )}
      empty={
        <EmptyState
          icon={<FileText size={26} />}
          title="No quotes found"
          description="Adjust your filters, or create a quote to get started."
          action={{ label: 'New quote', href: '/quotes/new' }}
        />
      }
    />
  )
}
