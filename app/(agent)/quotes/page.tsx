import { getQuotes, getQuoteStatusCounts } from '@/lib/queries/quotes'
import { requirePermission } from '@/lib/auth/permissions'
import { isCreateOnlyRole } from '@/lib/auth/create-only'
import { Topbar } from '@/components/layout/Topbar'
import { QuotesClient } from './QuotesClient'

export const dynamic = 'force-dynamic'

export default async function QuotesPage() {
  // 1000 newest, matching /bookings: the tab counts span the whole table, so
  // a 50-row fetch made search and the tabs disagree with their own numbers.
  const ctx = await requirePermission('bookings', 'read')
  // Corporate Sales see only the quotes they made — and tab counts of their own.
  const mine = isCreateOnlyRole(ctx.profile.role.slug)
  const [quotes, allCounts] = await Promise.all([
    getQuotes({ limit: 1000, ...(mine ? { created_by: ctx.user_id } : {}) }),
    mine ? Promise.resolve(null) : getQuoteStatusCounts(),
  ])
  const statusCounts = allCounts ?? quotes.reduce(
    (c, q) => { if (q.status in c) c[q.status as keyof typeof c] += 1; return c },
    { draft: 0, sent: 0, confirmed: 0, cancelled: 0 } as Awaited<ReturnType<typeof getQuoteStatusCounts>>,
  )

  return (
    <div className="flex flex-col">
      <Topbar
        title={mine ? 'My quotes' : 'Quotes'}
        subtitle={mine ? 'Quotes you made' : 'Manage and track all customer quotations'}
        action={{ label: 'New Quote', href: '/quotes/new' }}
      />
      <div className="flex flex-col gap-0 p-4 sm:p-6">
        <QuotesClient quotes={quotes} statusCounts={statusCounts} />
      </div>
    </div>
  )
}
