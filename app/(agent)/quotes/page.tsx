import { getQuotes, getQuoteStatusCounts } from '@/lib/queries/quotes'
import { Topbar } from '@/components/layout/Topbar'
import { QuotesClient } from './QuotesClient'

export const dynamic = 'force-dynamic'

export default async function QuotesPage() {
  // 1000 newest, matching /bookings: the tab counts span the whole table, so
  // a 50-row fetch made search and the tabs disagree with their own numbers.
  const [quotes, statusCounts] = await Promise.all([
    getQuotes({ limit: 1000 }),
    getQuoteStatusCounts(),
  ])

  return (
    <div className="flex flex-col">
      <Topbar
        title="Quotes"
        subtitle="Manage and track all customer quotations"
        action={{ label: 'New Quote', href: '/quotes/new' }}
      />
      <div className="flex flex-col gap-0 p-4 sm:p-6">
        <QuotesClient quotes={quotes} statusCounts={statusCounts} />
      </div>
    </div>
  )
}
