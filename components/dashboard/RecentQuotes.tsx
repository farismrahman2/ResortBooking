import Link from 'next/link'
import type { QuoteRow } from '@/lib/supabase/types'
import { StatusBadge } from '@/components/ui/Badge'
import { formatBDT } from '@/lib/formatters/currency'
import { formatDate } from '@/lib/formatters/dates'

interface RecentQuotesProps {
  quotes: QuoteRow[]
}

export function RecentQuotes({ quotes }: RecentQuotesProps) {
  return (
    <div className="card p-0 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
        <h3 className="text-base font-semibold text-gray-900">Recent Quotes</h3>
        <Link
          href="/quotes"
          className="text-sm text-forest-700 hover:text-forest-800 hover:underline font-medium"
        >
          View All
        </Link>
      </div>

      {quotes.length === 0 ? (
        <div className="px-5 py-10 text-center text-sm text-gray-400">
          No quotes yet. Start by creating a new quote.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="px-4 py-2.5 text-left font-medium text-gray-500 text-xs uppercase tracking-wide">
                  Quote #
                </th>
                <th className="px-4 py-2.5 text-left font-medium text-gray-500 text-xs uppercase tracking-wide">
                  Customer
                </th>
                <th className="px-4 py-2.5 text-left font-medium text-gray-500 text-xs uppercase tracking-wide">
                  Date
                </th>
                <th className="px-4 py-2.5 text-right font-medium text-gray-500 text-xs uppercase tracking-wide">
                  Amount
                </th>
                <th className="px-4 py-2.5 text-left font-medium text-gray-500 text-xs uppercase tracking-wide">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {quotes.slice(0, 5).map((quote) => (
                <tr key={quote.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <Link
                      href={`/quotes/${quote.id}`}
                      className="font-mono text-xs text-forest-700 hover:underline font-medium"
                    >
                      {quote.quote_number}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-900 font-medium">{quote.customer_name}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{formatDate(quote.visit_date)}</td>
                  <td className="px-4 py-3 text-right font-mono text-xs font-medium text-gray-900">
                    {formatBDT(quote.total)}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={quote.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
