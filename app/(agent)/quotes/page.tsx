import { getQuotes, getQuoteStatusCounts } from '@/lib/queries/quotes'
import { Topbar } from '@/components/layout/Topbar'
import { QuotesClient } from './QuotesClient'

export const dynamic = 'force-dynamic'

export default async function QuotesPage() {
  const [quotes, statusCounts] = await Promise.all([
    getQuotes({ limit: 50 }),
    getQuoteStatusCounts(),
  ])

  return (
    <div className="flex flex-col">
      <Topbar
        title="Quotes"
        subtitle="Manage and track all customer quotations"
        action={{ label: 'New Quote', href: '/quotes/new' }}
      />
      <div className="flex flex-col gap-0 p-6">
        <QuotesClient quotes={quotes} statusCounts={statusCounts} />
      </div>
    </div>
  )
}
